// routes/productRoutes.js
import {
    getAllProducts,
    getProductById,
    getProductBySlug,
    createProduct,
    updateProduct,
    deleteProduct,
    getFeaturedProducts,
    getFeaturedPriceRanges,
    getFilteredFeaturedProducts,
    searchProducts,
    quickSearchProducts,
    uploadVariantImages,
    getOfferProducts
} from '../controller/productController.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import crypto from 'crypto';
import { DatabaseError } from '../utils/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Ensure uploads folder exists
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Generate unique filename
const generateUniqueFilename = (originalname, fieldname) => {
    const ext = path.extname(originalname);
    const randomString = crypto.randomBytes(4).toString('hex');
    const safeFieldname = fieldname.replace(/[^a-zA-Z0-9]/g, '_');
    return `${Date.now()}-${randomString}-${safeFieldname}${ext}`;
};

// ✅ Extract value from field object
const extractValue = (field) => {
    if (field === undefined || field === null) return undefined;
    if (typeof field === 'object' && field.value !== undefined) {
        return field.value;
    }
    if (typeof field === 'object' && field.type === 'field') {
        return field.value;
    }
    return field;
};

// ✅ Check if field is a file
const isFile = (field) => {
    return field && typeof field === 'object' && (field.type === 'file' || field.file);
};

// ✅ Process a single file
const processFile = async (file, fieldname) => {
    try {
        console.log(`   📥 Processing file: ${file.filename}`);
        
        const buffer = await file.toBuffer();
        const filename = generateUniqueFilename(file.filename, fieldname);
        const filePath = path.join(uploadDir, filename);
        
        fs.writeFileSync(filePath, buffer);
        
        // Convert to WebP
        try {
            const webpPath = filePath.replace(/\.[^.]+$/, '.webp');
            await sharp(buffer)
                .webp({ quality: 80 })
                .toFile(webpPath);
            fs.unlinkSync(filePath);
            
            const fileObj = {
                fieldname: fieldname,
                originalname: file.filename,
                filename: path.basename(webpPath),
                path: webpPath,
                mimetype: 'image/webp',
                size: fs.statSync(webpPath).size
            };
            console.log(`   ✅ File saved: ${path.basename(webpPath)}`);
            return fileObj;
        } catch (error) {
            // Fallback - keep original
            const fileObj = {
                fieldname: fieldname,
                originalname: file.filename,
                filename: filename,
                path: filePath,
                mimetype: file.mimetype,
                size: fs.statSync(filePath).size
            };
            console.log(`   ✅ File saved (fallback): ${filename}`);
            return fileObj;
        }
    } catch (error) {
        console.error(`   ❌ Error processing file:`, error);
        return null;
    }
};

// ✅ Process uploaded files from Fastify multipart - FIXED for multiple files
const processUploadedFiles = async (req) => {
    const files = [];
    const fields = {};

    if (!req.body) return { files, fields };

    for (const [key, value] of Object.entries(req.body)) {
        // ✅ Check if it's an array of files (multiple images)
        if (Array.isArray(value) && value.length > 0 && isFile(value[0])) {
            console.log(`📥 Processing ${value.length} files for field: ${key}`);
            for (const file of value) {
                const processed = await processFile(file, key);
                if (processed) files.push(processed);
            }
        }
        // ✅ Single file
        else if (isFile(value)) {
            console.log(`📥 Processing single file for field: ${key}`);
            const processed = await processFile(value, key);
            if (processed) files.push(processed);
        }
        // ✅ Regular field
        else {
            fields[key] = extractValue(value);
        }
    }

    console.log(`📋 Extracted fields:`, Object.keys(fields));
    console.log(`📁 Processed files: ${files.length}`);
    
    return { files, fields };
};

export default async function productRoutes(fastify, opts) {
    // ✅ Routes - Specific first, parameter routes last
    fastify.get('/', getAllProducts);
    fastify.get('/featured', getFeaturedProducts);
    fastify.get('/featured/price-ranges', getFeaturedPriceRanges);
    fastify.get('/featured/filter', getFilteredFeaturedProducts);
    fastify.get('/search', searchProducts);
    fastify.get('/quick-search', quickSearchProducts);
    fastify.get('/offers', getOfferProducts);
    fastify.get('/:id', getProductById);
    fastify.get('/slug/:slug', getProductBySlug);

    // ✅ CREATE PRODUCT - with Fastify multipart
    fastify.post('/', {
        preHandler: async (req, reply) => {
            console.log('\n🔵 ========== CREATE PRODUCT ==========');
            
            // ✅ Process files and extract fields from req.body
            const { files, fields } = await processUploadedFiles(req);
            
            // ✅ Set files on req
            req.files = files;
            
            // ✅ Rebuild req.body with extracted field values
            req.body = { ...fields };
            
            console.log('📋 After extraction - req.body:', req.body);
            console.log(`📁 Total files: ${req.files?.length || 0}`);
            req.files?.forEach((f, i) => {
                console.log(`   File ${i + 1}: ${f.fieldname} -> ${f.filename}`);
            });
            
            // ✅ Convert string values to proper types
            if (req.body.basePrice) {
                req.body.basePrice = parseFloat(req.body.basePrice);
                console.log(`💰 basePrice: ${req.body.basePrice}`);
            }
            if (req.body.originalPrice) {
                req.body.originalPrice = parseFloat(req.body.originalPrice);
            }
            if (req.body.discountPercentage) {
                req.body.discountPercentage = parseFloat(req.body.discountPercentage);
            }
            if (req.body.stock) {
                req.body.stock = parseInt(req.body.stock);
            } else if (req.body.stock === undefined || req.body.stock === null) {
                req.body.stock = 0;
            }
            if (req.body.rating) {
                req.body.rating = parseFloat(req.body.rating);
            }
            if (req.body.numberOfReviews) {
                req.body.numberOfReviews = parseInt(req.body.numberOfReviews);
            }
            if (req.body.displayOrder) {
                req.body.displayOrder = parseInt(req.body.displayOrder);
            }
            
            // ✅ Convert boolean strings
            ['hasOffer', 'featured'].forEach(key => {
                if (req.body[key] === 'true') req.body[key] = true;
                if (req.body[key] === 'false') req.body[key] = false;
            });
            
            // ✅ Parse JSON fields
            ['specifications', 'keyFeatures', 'metaKeywords', 'variants'].forEach(key => {
                if (req.body[key] && typeof req.body[key] === 'string') {
                    try {
                        req.body[key] = JSON.parse(req.body[key]);
                    } catch (e) {
                        console.log(`⚠️ Failed to parse ${key}:`, e.message);
                    }
                }
            });
            
            console.log('✅ FINAL req.body:', JSON.stringify(req.body, null, 2));
            console.log(`📁 Files: ${req.files?.length || 0}`);
            console.log('=====================================\n');
        }
    }, createProduct);

    // ✅ UPDATE PRODUCT - with Fastify multipart
    fastify.put('/:id', {
        preHandler: async (req, reply) => {
            console.log('\n🔵 ========== UPDATE PRODUCT ==========');
            
            const { files, fields } = await processUploadedFiles(req);
            req.files = files;
            req.body = { ...fields };
            
            console.log(`📁 Total files: ${req.files?.length || 0}`);
            
            if (req.body.basePrice) req.body.basePrice = parseFloat(req.body.basePrice);
            if (req.body.originalPrice) req.body.originalPrice = parseFloat(req.body.originalPrice);
            if (req.body.discountPercentage) req.body.discountPercentage = parseFloat(req.body.discountPercentage);
            if (req.body.stock) req.body.stock = parseInt(req.body.stock);
            
            ['hasOffer', 'featured'].forEach(key => {
                if (req.body[key] === 'true') req.body[key] = true;
                if (req.body[key] === 'false') req.body[key] = false;
            });
            
            ['specifications', 'keyFeatures', 'metaKeywords', 'variants', 'deletedMainImages', 'deletedVariantImages'].forEach(key => {
                if (req.body[key] && typeof req.body[key] === 'string') {
                    try {
                        req.body[key] = JSON.parse(req.body[key]);
                    } catch (e) {}
                }
            });
            
            console.log('✅ FINAL req.body:', JSON.stringify(req.body, null, 2));
            console.log('=====================================\n');
        }
    }, updateProduct);

    // ✅ UPLOAD VARIANT IMAGES
    fastify.post('/:productId/variants/:variantIndex/images', {
        preHandler: async (req, reply) => {
            const { files, fields } = await processUploadedFiles(req);
            req.files = files;
            req.body = { ...fields };
        }
    }, uploadVariantImages);

    fastify.delete('/:id', deleteProduct);
}