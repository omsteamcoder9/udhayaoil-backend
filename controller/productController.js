// controllers/productController.js
import Product from '../models/productModel.js';
import Category from '../models/Category.js';
import slugify from 'slugify';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  DatabaseError
} from '../utils/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to delete image files
const deleteImageFile = (imagePath) => {
  if (!imagePath) return false;

  try {
    console.log('🔍 Attempting to delete:', imagePath);

    const uploadsFolder = path.join(process.cwd(), 'uploads');
    let filename = '';

    if (imagePath.includes('/uploads/')) {
      const parts = imagePath.split('/uploads/');
      filename = parts[parts.length - 1];
    } else if (imagePath.includes('uploads/')) {
      const parts = imagePath.split('uploads/');
      filename = parts[parts.length - 1];
    } else if (imagePath.includes('\\')) {
      const parts = imagePath.split('\\');
      filename = parts[parts.length - 1];
    } else {
      filename = imagePath;
    }

    filename = filename.split('?')[0].split('#')[0];
    filename = filename.replace(/^[/\\]+|[/\\]+$/g, '');
    
    const filePath = path.join(uploadsFolder, filename);

    console.log(`📁 Looking for: ${filename} in ${uploadsFolder}`);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ DELETED: ${filename}`);
      return true;
    } else {
      console.log(`❌ File not found: ${filename}`);
      
      if (fs.existsSync(uploadsFolder)) {
        const files = fs.readdirSync(uploadsFolder);
        const matchedFile = files.find(f => 
          f.toLowerCase() === filename.toLowerCase()
        );
        
        if (matchedFile) {
          const matchedPath = path.join(uploadsFolder, matchedFile);
          fs.unlinkSync(matchedPath);
          console.log(`✅ DELETED (case-insensitive): ${matchedFile}`);
          return true;
        }
      }
      
      return false;
    }
  } catch (error) {
    console.error('❌ Error deleting file:', error);
    return false;
  }
};

// ============================================
// CREATE PRODUCT
// ============================================
export const createProduct = async (req, reply) => {
  const {
    name,
    basePrice,
    description,
    category,
    rating,
    seller,
    stock,
    numberOfReviews,
    specifications,
    keyFeatures,
    variants,
    metaTitle,
    metaDescription,
    metaKeywords,
    canonicalUrl,
    ogTitle,
    ogDescription
  } = req.body;

  console.log('📥 Received product data:', req.body);
  console.log('📁 Uploaded files:', req.files?.map(f => ({
    fieldname: f.fieldname,
    filename: f.filename,
    originalname: f.originalname
  })));

  // Offer System Variables
  let finalBasePrice = parseFloat(basePrice);
  let finalOriginalPrice = parseFloat(basePrice);
  let finalDiscountPercentage = 0;
  let finalHasOffer = false;

  if (req.body.hasOffer === true || req.body.hasOffer === 'true') {
    if (req.body.originalPrice && req.body.basePrice) {
      const original = parseFloat(req.body.originalPrice);
      const base = parseFloat(req.body.basePrice);
      const discountAmount = original - base;
      const discountPercentage = (discountAmount / original) * 100;

      finalHasOffer = true;
      finalOriginalPrice = original;
      finalBasePrice = base;
      finalDiscountPercentage = Math.round(discountPercentage * 100) / 100;

      console.log('🎯 Offer calculated from both prices:', {
        originalPrice: finalOriginalPrice,
        basePrice: finalBasePrice,
        discountPercentage: finalDiscountPercentage + '%',
        discountAmount
      });
    }
    else if (req.body.originalPrice && req.body.discountPercentage) {
      finalHasOffer = true;
      finalOriginalPrice = parseFloat(req.body.originalPrice);
      finalDiscountPercentage = parseFloat(req.body.discountPercentage);
      const discountAmount = (finalOriginalPrice * finalDiscountPercentage) / 100;
      finalBasePrice = finalOriginalPrice - discountAmount;

      console.log('🎯 Offer Applied:', {
        originalPrice: finalOriginalPrice,
        discountPercentage: finalDiscountPercentage + '%',
        discountAmount,
        finalPrice: finalBasePrice
      });
    }
    else if (req.body.basePrice && !req.body.originalPrice && !req.body.discountPercentage) {
      const assumedMarkup = 1.25;
      finalBasePrice = parseFloat(req.body.basePrice);
      finalOriginalPrice = finalBasePrice * assumedMarkup;
      finalDiscountPercentage = ((assumedMarkup - 1) / assumedMarkup) * 100;
      finalHasOffer = true;

      console.log('🎯 Offer auto-calculated with assumed markup:', {
        basePrice: finalBasePrice,
        assumedOriginalPrice: finalOriginalPrice,
        discountPercentage: finalDiscountPercentage + '%'
      });
    }
    else {
      finalHasOffer = false;
      finalBasePrice = parseFloat(basePrice);
      finalOriginalPrice = finalBasePrice;
      finalDiscountPercentage = 0;
      console.log('⚠️ hasOffer is true but no pricing data provided. Setting hasOffer to false.');
    }
  }

  const missingFields = [];
  if (!name) missingFields.push('name');
  if (!basePrice) missingFields.push('basePrice');
  if (!description) missingFields.push('description');
  if (!seller) missingFields.push('seller');
  if (!category) missingFields.push('category');

  if (missingFields.length > 0) {
    throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`, {
      missingFields
    });
  }

  let parsedSpecifications = [];
  if (specifications) {
    parsedSpecifications = typeof specifications === 'string'
      ? JSON.parse(specifications)
      : specifications;
  }

  let parsedKeyFeatures = [];
  if (keyFeatures) {
    if (typeof keyFeatures === 'string') {
      try {
        parsedKeyFeatures = JSON.parse(keyFeatures);
      } catch (error) {
        parsedKeyFeatures = keyFeatures
          .split(',')
          .map(feature => feature.trim())
          .filter(feature => feature !== '');
      }
    } else if (Array.isArray(keyFeatures)) {
      parsedKeyFeatures = keyFeatures
        .map(feature => typeof feature === 'string' ? feature.trim() : feature)
        .filter(feature => feature && feature !== '');
    }
  }

  let parsedMetaKeywords = [];
  if (metaKeywords) {
    if (typeof metaKeywords === 'string') {
      try {
        parsedMetaKeywords = JSON.parse(metaKeywords);
      } catch (error) {
        parsedMetaKeywords = metaKeywords
          .split(',')
          .map(keyword => keyword.trim())
          .filter(keyword => keyword !== '');
      }
    } else if (Array.isArray(metaKeywords)) {
      parsedMetaKeywords = metaKeywords.filter(keyword => keyword && keyword.trim() !== '');
    }
  }

  let parsedVariants = [];
  if (variants) {
    try {
      parsedVariants = typeof variants === 'string'
        ? JSON.parse(variants)
        : variants;

      parsedVariants = parsedVariants.map((variant, index) => ({
        variantName: variant.variantName || `Pack ${index + 1}`,
        price: parseFloat(variant.price) || parseFloat(basePrice),
        originalPrice: variant.originalPrice ? parseFloat(variant.originalPrice) : undefined,
        description: variant.description || '',
        weight: variant.weight ? parseFloat(variant.weight) : 0,
        weightUnit: variant.weightUnit || 'gram',
        stock: parseInt(variant.stock) || 0,
        images: variant.images || [],
        sku: variant.sku || '',
        isDefault: variant.isDefault || (index === 0),
        status: variant.status || 'active',
        discountPercentage: variant.discountPercentage || 0,
        features: variant.features || []
      }));
    } catch (error) {
      console.error('❌ Error parsing variants:', error);
      parsedVariants = [];
    }
  }

  const mainImages = req.files
    ? req.files
      .filter(file => file.fieldname === 'images')
      .map(file => ({
        image: `/uploads/${file.filename}`
      }))
    : [];

  let ogImagePath = null;
  if (req.files) {
    const ogImageFile = req.files.find(file => file.fieldname === 'ogImage');
    if (ogImageFile) {
      ogImagePath = `/uploads/${ogImageFile.filename}`;
      console.log('✅ OG Image found and saved:', ogImagePath);
    } else if (req.body.ogImage && typeof req.body.ogImage === 'string' && req.body.ogImage.trim() !== '') {
      ogImagePath = req.body.ogImage;
      console.log('✅ OG Image provided as URL:', ogImagePath);
    } else if (mainImages.length > 0) {
      ogImagePath = mainImages[0].image;
      console.log('ℹ️ OG Image not provided, using first main image as fallback:', ogImagePath);
    } else {
      console.log('ℹ️ OG Image not provided and no main images available');
    }
  } else if (req.body.ogImage && typeof req.body.ogImage === 'string' && req.body.ogImage.trim() !== '') {
    ogImagePath = req.body.ogImage;
    console.log('✅ OG Image provided as URL (no files uploaded):', ogImagePath);
  }

  const variantImagesMap = {};
  if (req.files && parsedVariants.length > 0) {
    req.files.forEach(file => {
      const variantMatch = file.fieldname.match(/variants\[(\d+)\]\.images/);
      if (variantMatch) {
        const variantIndex = parseInt(variantMatch[1]);
        if (!variantImagesMap[variantIndex]) {
          variantImagesMap[variantIndex] = [];
        }
        variantImagesMap[variantIndex].push({
          image: `/uploads/${file.filename}`
        });
      }
    });

    parsedVariants = parsedVariants.map((variant, index) => ({
      ...variant,
      images: variantImagesMap[index] || variant.images || []
    }));
  }

  const totalStock = parsedVariants.length > 0
    ? parsedVariants.reduce((sum, variant) => sum + (variant.stock || 0), 0)
    : parseInt(stock) || 0;

  if (totalStock <= 0) {
    throw new ValidationError('Total stock must be greater than 0', {
      totalStock
    });
  }

  console.log('📊 Final product data:', {
    name,
    variantsCount: parsedVariants.length,
    variantImages: parsedVariants.map(v => v.images.length),
    mainImagesCount: mainImages.length,
    hasOffer: finalHasOffer,
    originalPrice: finalOriginalPrice,
    discountPercentage: finalDiscountPercentage,
    finalPrice: finalBasePrice,
    metaTitle: metaTitle || '(not set)',
    metaDescriptionLength: metaDescription ? metaDescription.length : 0,
    metaKeywordsCount: parsedMetaKeywords.length,
    ogImagePath: ogImagePath || '(none)'
  });

  const product = new Product({
    name,
    basePrice: finalBasePrice,
    originalPrice: finalOriginalPrice,
    discountPercentage: finalDiscountPercentage,
    hasOffer: finalHasOffer,
    description,
    category: category || null,
    rating: rating || 0,
    seller,
    stock: totalStock,
    numberOfReviews: numberOfReviews || 0,
    specifications: parsedSpecifications,
    keyFeatures: parsedKeyFeatures,
    variants: parsedVariants,
    images: mainImages,
    metaTitle: metaTitle || '',
    metaDescription: metaDescription || '',
    metaKeywords: parsedMetaKeywords,
    canonicalUrl: canonicalUrl || '',
    ogTitle: ogTitle || '',
    ogDescription: ogDescription || '',
    ogImage: ogImagePath,
    status: 'active',
    featured: false
  });

  const savedProduct = await product.save();

  console.log('✅ Product created with variants:', {
    id: savedProduct._id,
    variantImages: savedProduct.variants.map(v => v.images.length),
    hasOffer: savedProduct.hasOffer,
    priceDetails: {
      original: savedProduct.originalPrice,
      discount: savedProduct.discountPercentage + '%',
      final: savedProduct.basePrice
    },
    seoSaved: {
      metaTitle: savedProduct.metaTitle ? 'Yes' : 'No',
      metaDescription: savedProduct.metaDescription ? 'Yes' : 'No',
      metaKeywords: savedProduct.metaKeywords?.length || 0,
      ogImage: savedProduct.ogImage ? 'Yes' : 'No'
    }
  });

  reply.status(201).send({
    success: true,
    message: 'Product created successfully',
    data: savedProduct
  });
};

// ============================================
// UPDATE PRODUCT
// ============================================
export const updateProduct = async (req, reply) => {
  const id = req.params.id?.trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid or missing product ID.', {
      field: 'id',
      received: id
    });
  }

  const existingProduct = await Product.findById(id);
  if (!existingProduct) {
    throw new NotFoundError('Product', { id });
  }

  console.log('📝 Updating product:', existingProduct.name);
  console.log('📥 Request body:', req.body);
  console.log('📁 Files:', req.files?.length || 0);

  if (req.body.stock !== undefined && req.body.stock !== null && req.body.stock !== '') {
    let stockValue;
    
    if (Array.isArray(req.body.stock)) {
      stockValue = parseInt(req.body.stock[0]);
    } else {
      stockValue = parseInt(req.body.stock);
    }
    
    if (!isNaN(stockValue) && stockValue >= 0) {
      req.body.stock = stockValue;
      console.log('✅ Stock set to:', req.body.stock);
    } else {
      console.log('⚠️ Invalid stock value, keeping existing:', existingProduct.stock);
      delete req.body.stock;
    }
  } else {
    delete req.body.stock;
  }

  if (isNaN(existingProduct.stock) || existingProduct.stock === undefined) {
    existingProduct.stock = 0;
  }

  let imagesChanged = false;

  // Handle deleted main images
  if (req.body.deletedMainImages) {
    try {
      let deletedImages = req.body.deletedMainImages;
      
      console.log('📥 Processing deletedMainImages:', deletedImages);
      console.log('📥 Type:', typeof deletedImages);

      if (typeof deletedImages === 'string') {
        try {
          deletedImages = JSON.parse(deletedImages);
          console.log('✅ Parsed as JSON:', deletedImages);
        } catch (e) {
          console.log('⚠️ JSON parse failed, splitting by comma');
          deletedImages = deletedImages.split(',').map(img => img.trim().replace(/^["']|["']$/g, ''));
        }
      }

      if (!Array.isArray(deletedImages)) {
        deletedImages = [deletedImages];
      }

      deletedImages = deletedImages.filter(img => img && img.trim() !== '');
      
      console.log('📦 Final deleted images list:', deletedImages);

      if (deletedImages.length > 0) {
        let fileDeletedCount = 0;
        deletedImages.forEach((imagePath) => {
          console.log(`🗑️ Deleting: ${imagePath}`);
          const result = deleteImageFile(imagePath);
          if (result) {
            fileDeletedCount++;
            console.log(`   ✅ Deleted successfully`);
          } else {
            console.log(`   ❌ Failed to delete`);
          }
        });
        console.log(`📊 Files deleted: ${fileDeletedCount}/${deletedImages.length}`);

        const originalCount = existingProduct.images.length;
        console.log(`📸 Original images (${originalCount}):`, existingProduct.images.map(img => img.image));
        
        const deletedFilenames = deletedImages.map(img => {
          if (img.includes('/uploads/')) {
            return img.split('/uploads/')[1].replace(/^[/\\]+|[/\\]+$/g, '');
          }
          return img.replace(/^[/\\]+|[/\\]+$/g, '');
        });
        
        console.log('🔍 Looking for these filenames:', deletedFilenames);

        existingProduct.images = existingProduct.images.filter(img => {
          let imageFilename = img.image;
          if (imageFilename.includes('/uploads/')) {
            imageFilename = imageFilename.split('/uploads/')[1];
          }
          imageFilename = imageFilename.replace(/^[/\\]+|[/\\]+$/g, '');
          
          const shouldKeep = !deletedFilenames.includes(imageFilename);
          console.log(`   "${img.image}" → ${shouldKeep ? 'KEEP' : 'REMOVE'}`);
          return shouldKeep;
        });

        console.log(`📊 Main images: ${originalCount} → ${existingProduct.images.length}`);
        imagesChanged = true;
      }
    } catch (error) {
      console.error('❌ Error processing deletedMainImages:', error);
    }
  }

  // Handle deleted variant images
  if (req.body.deletedVariantImages) {
    try {
      let deletedVariantImages = req.body.deletedVariantImages;
      
      console.log('📥 Processing deletedVariantImages:', deletedVariantImages);
      console.log('📥 Type:', typeof deletedVariantImages);

      if (typeof deletedVariantImages === 'string') {
        try {
          deletedVariantImages = JSON.parse(deletedVariantImages);
          console.log('✅ Parsed as JSON object:', deletedVariantImages);
        } catch (e) {
          console.log('⚠️ JSON parse failed, using empty object');
          deletedVariantImages = {};
        }
      }

      if (deletedVariantImages && typeof deletedVariantImages === 'object') {
        Object.entries(deletedVariantImages).forEach(([variantIndex, images]) => {
          const idx = parseInt(variantIndex);
          
          if (!Array.isArray(images)) {
            images = [images];
          }
          
          images = images.filter(img => img && img.trim() !== '');
          
          if (images.length === 0) return;
          
          const cleanedImages = images.map(img => {
            img = img.replace(/^["']|["']$/g, '');
            if (img.includes('/uploads/')) {
              const parts = img.split('/uploads/');
              img = parts[parts.length - 1];
            }
            return img.replace(/^[/\\]+|[/\\]+$/g, '').trim();
          });
          
          console.log(`🧹 Cleaned filenames for variant ${idx}:`, cleanedImages);
          
          cleanedImages.forEach((filename) => {
            console.log(`🗑️ Deleting variant ${idx} image: ${filename}`);
            const deleted = deleteImageFile(filename);
            console.log(`   Result: ${deleted ? '✅ SUCCESS' : '❌ FAILED'}`);
          });

          if (existingProduct.variants && existingProduct.variants[idx]) {
            const originalCount = existingProduct.variants[idx].images?.length || 0;
            
            existingProduct.variants[idx].images = existingProduct.variants[idx].images.filter(img => {
              let imageFilename = img.image;
              if (imageFilename.includes('/uploads/')) {
                const parts = imageFilename.split('/uploads/');
                imageFilename = parts[parts.length - 1];
              }
              imageFilename = imageFilename.replace(/^[/\\]+|[/\\]+$/g, '').trim();
              
              return !cleanedImages.includes(imageFilename);
            });
            
            console.log(`📊 Variant ${idx} images: ${originalCount} → ${existingProduct.variants[idx].images.length}`);
            imagesChanged = true;
          }
        });
      }
    } catch (error) {
      console.error('❌ Error processing deletedVariantImages:', error);
    }
  }

  // Handle deleted OG image
  if (req.body.deletedOgImage) {
    try {
      let deletedOgImage = req.body.deletedOgImage;
      console.log('🗑️ Processing deleted OG image:', deletedOgImage);

      if (typeof deletedOgImage === 'string') {
        deletedOgImage = deletedOgImage.replace(/^["']|["']$/g, '');
        
        if (!deletedOgImage.startsWith('/uploads/') && !deletedOgImage.startsWith('http')) {
          deletedOgImage = `/uploads/${deletedOgImage}`;
        }

        if (deletedOgImage.startsWith('/uploads/')) {
          console.log(`🗑️ Deleting OG image: ${deletedOgImage}`);
          deleteImageFile(deletedOgImage);
          existingProduct.ogImage = null;
          imagesChanged = true;
        }
      }
    } catch (error) {
      console.error('❌ Error processing deletedOgImage:', error);
    }
  }

  // Handle new image uploads
  if (req.files && req.files.length > 0) {
    console.log(`📁 Processing ${req.files.length} new files...`);
    
    const newMainImages = req.files
      .filter(file => file.fieldname === 'images')
      .map(file => ({
        image: `/uploads/${file.filename}`
      }));

    if (newMainImages.length > 0) {
      existingProduct.images = [...existingProduct.images, ...newMainImages];
      imagesChanged = true;
      console.log(`✅ Added ${newMainImages.length} new main images`);
    }

    const ogImageFile = req.files.find(file => file.fieldname === 'ogImage');
    if (ogImageFile) {
      if (existingProduct.ogImage && existingProduct.ogImage.startsWith('/uploads/')) {
        console.log(`🗑️ Deleting old OG image: ${existingProduct.ogImage}`);
        deleteImageFile(existingProduct.ogImage);
      }
      existingProduct.ogImage = `/uploads/${ogImageFile.filename}`;
      console.log('✅ Updated OG Image from file:', existingProduct.ogImage);
      imagesChanged = true;
    }

    const variantImagesMap = {};
    req.files.forEach(file => {
      const variantMatch = file.fieldname.match(/variants\[(\d+)\]\.images/);
      if (variantMatch) {
        const variantIndex = parseInt(variantMatch[1]);
        if (!variantImagesMap[variantIndex]) {
          variantImagesMap[variantIndex] = [];
        }
        variantImagesMap[variantIndex].push({
          image: `/uploads/${file.filename}`
        });
      }
    });

    if (Object.keys(variantImagesMap).length > 0) {
      Object.entries(variantImagesMap).forEach(([index, images]) => {
        const variantIdx = parseInt(index);
        if (existingProduct.variants && existingProduct.variants[variantIdx]) {
          if (!existingProduct.variants[variantIdx].images) {
            existingProduct.variants[variantIdx].images = [];
          }
          existingProduct.variants[variantIdx].images = [
            ...existingProduct.variants[variantIdx].images,
            ...images
          ];
          imagesChanged = true;
          console.log(`✅ Added ${images.length} images to variant ${variantIdx}`);
        }
      });
    }
  }

  // Handle OG image update from URL
  if (req.body.ogImage !== undefined) {
    if (!req.body.ogImage || req.body.ogImage.trim() === '') {
      if (existingProduct.ogImage && existingProduct.ogImage.startsWith('/uploads/')) {
        console.log('🗑️ Deleting OG image (removed by user):', existingProduct.ogImage);
        deleteImageFile(existingProduct.ogImage);
      }
      existingProduct.ogImage = null;
      console.log('✅ OG Image removed');
      imagesChanged = true;
    } else if (existingProduct.ogImage !== req.body.ogImage) {
      if (existingProduct.ogImage && existingProduct.ogImage.startsWith('/uploads/')) {
        console.log('🗑️ Deleting old OG image:', existingProduct.ogImage);
        deleteImageFile(existingProduct.ogImage);
      }
      existingProduct.ogImage = req.body.ogImage;
      console.log('✅ Updated OG Image to:', req.body.ogImage);
      imagesChanged = true;
    }
  }

  // Handle offer update
  if (req.body.hasOffer !== undefined) {
    if (req.body.hasOffer === 'true' || req.body.hasOffer === true) {
      if (req.body.originalPrice && req.body.basePrice) {
        const original = parseFloat(req.body.originalPrice);
        const base = parseFloat(req.body.basePrice);
        const discountPercentage = ((original - base) / original) * 100;

        existingProduct.basePrice = base;
        existingProduct.originalPrice = original;
        existingProduct.discountPercentage = Math.round(discountPercentage * 100) / 100;
        existingProduct.hasOffer = true;

        console.log('🎯 Update: Offer calculated from both prices');
      }
      else if (req.body.originalPrice && req.body.discountPercentage) {
        const originalPrice = parseFloat(req.body.originalPrice);
        const discountPercentage = parseFloat(req.body.discountPercentage);
        const discountAmount = (originalPrice * discountPercentage) / 100;

        existingProduct.basePrice = originalPrice - discountAmount;
        existingProduct.originalPrice = originalPrice;
        existingProduct.discountPercentage = discountPercentage;
        existingProduct.hasOffer = true;

        console.log('🎯 Update: Offer applied with discount');
      }
      else if (req.body.basePrice) {
        if (existingProduct.originalPrice && existingProduct.originalPrice !== existingProduct.basePrice) {
          const newBasePrice = parseFloat(req.body.basePrice);
          const discountPercentage = ((existingProduct.originalPrice - newBasePrice) / existingProduct.originalPrice) * 100;

          existingProduct.basePrice = newBasePrice;
          existingProduct.discountPercentage = Math.round(discountPercentage * 100) / 100;
          existingProduct.hasOffer = true;

          console.log('🎯 Update: Offer calculated from existing originalPrice');
        } else {
          const assumedMarkup = 1.25;
          const newBasePrice = parseFloat(req.body.basePrice);
          const assumedOriginalPrice = newBasePrice * assumedMarkup;
          const discountPercentage = ((assumedMarkup - 1) / assumedMarkup) * 100;

          existingProduct.basePrice = newBasePrice;
          existingProduct.originalPrice = assumedOriginalPrice;
          existingProduct.discountPercentage = discountPercentage;
          existingProduct.hasOffer = true;

          console.log('🎯 Update: Offer auto-calculated with assumed markup');
        }
      }
      else if (req.body.discountPercentage) {
        const discountPercentage = parseFloat(req.body.discountPercentage);
        const referencePrice = existingProduct.originalPrice || existingProduct.basePrice;
        const discountAmount = (referencePrice * discountPercentage) / 100;

        existingProduct.basePrice = referencePrice - discountAmount;
        existingProduct.originalPrice = referencePrice;
        existingProduct.discountPercentage = discountPercentage;
        existingProduct.hasOffer = true;

        console.log('🎯 Update: Offer applied with discount only');
      }
    } else {
      if (req.body.basePrice !== undefined) {
        existingProduct.basePrice = parseFloat(req.body.basePrice);
        existingProduct.originalPrice = existingProduct.basePrice;
        existingProduct.discountPercentage = 0;
        existingProduct.hasOffer = false;
        console.log('🔚 Update: Offer turned off, resetting prices');
      }
    }
  }

  // Update SEO fields
  const seoTextFields = ['metaTitle', 'metaDescription', 'canonicalUrl', 'ogTitle', 'ogDescription'];
  seoTextFields.forEach(field => {
    if (req.body[field] !== undefined && req.body[field] !== null && req.body[field] !== '') {
      existingProduct[field] = req.body[field];
      console.log(`✅ Updated ${field}:`, req.body[field]);
    }
  });

  // Update meta keywords
  if (req.body.metaKeywords !== undefined) {
    let parsedKeywords = [];
    if (typeof req.body.metaKeywords === 'string') {
      try {
        parsedKeywords = JSON.parse(req.body.metaKeywords);
        console.log('✅ Parsed metaKeywords from JSON');
      } catch (error) {
        parsedKeywords = req.body.metaKeywords
          .split(',')
          .map(keyword => keyword.trim())
          .filter(keyword => keyword !== '');
        console.log('✅ Parsed metaKeywords from comma-separated string');
      }
    } else if (Array.isArray(req.body.metaKeywords)) {
      parsedKeywords = req.body.metaKeywords.filter(keyword => keyword && keyword.trim() !== '');
      console.log('✅ Using metaKeywords array');
    }
    existingProduct.metaKeywords = parsedKeywords;
  }

  // Handle variants update
  if (req.body.variants !== undefined) {
    let parsedVariants = req.body.variants;
    if (typeof parsedVariants === 'string') {
      try {
        parsedVariants = JSON.parse(parsedVariants);
        console.log('✅ Parsed variants from JSON');
      } catch (error) {
        console.error('❌ Error parsing variants:', error);
      }
    }
    if (Array.isArray(parsedVariants)) {
      existingProduct.variants = parsedVariants.map((variant, index) => {
        const existingVariant = existingProduct.variants[index] || {};
        return {
          ...variant,
          images: existingVariant.images || [],
          weight: variant.weight ? parseFloat(variant.weight) : 0,
          weightUnit: variant.weightUnit || 'gram',
          variantSlug: variant.variantSlug || 
            slugify(`${existingProduct.name} ${variant.variantName || `Pack ${index + 1}`}`, {
              lower: true,
              strict: true
            }) + `-${index + 1}`
        };
      });
      imagesChanged = true;
      console.log(`✅ Updated ${existingProduct.variants.length} variants`);
    }
  }

  // Update other fields
  for (const [key, value] of Object.entries(req.body)) {
    if (value !== undefined && value !== null && value !== '' &&
      key !== 'variants' && !seoTextFields.includes(key) &&
      key !== 'metaKeywords' && key !== 'ogImage' &&
      key !== 'deletedMainImages' && key !== 'deletedVariantImages' &&
      key !== 'deletedOgImage' && key !== 'hasOffer' &&
      key !== 'originalPrice' && key !== 'discountPercentage' &&
      key !== 'basePrice' && key !== 'stock') {

      if (key === 'specifications') {
        let parsedSpecifications = typeof value === 'string' ? JSON.parse(value) : value;
        existingProduct[key] = parsedSpecifications;
        console.log(`✅ Updated ${key}:`, parsedSpecifications);
      } else if (key === 'keyFeatures') {
        let parsedKeyFeatures = [];
        if (typeof value === 'string') {
          try {
            parsedKeyFeatures = JSON.parse(value);
          } catch (error) {
            parsedKeyFeatures = value
              .split(',')
              .map(feature => feature.trim())
              .filter(feature => feature !== '');
          }
        } else if (Array.isArray(value)) {
          parsedKeyFeatures = value
            .map(feature => typeof feature === 'string' ? feature.trim() : feature)
            .filter(feature => feature && feature !== '');
        }
        existingProduct[key] = parsedKeyFeatures;
        console.log(`✅ Updated ${key}:`, parsedKeyFeatures);
      } else if (key !== 'slug') {
        existingProduct[key] = value;
        console.log(`✅ Updated ${key}:`, value);
      }
    }
  }

  if (req.body.name && req.body.name !== existingProduct.name) {
    existingProduct.name = req.body.name;
    console.log('✅ Updated name to:', req.body.name);
  }

  if (isNaN(existingProduct.stock) || existingProduct.stock === undefined || existingProduct.stock === null) {
    console.log('⚠️ Stock was NaN/null, setting to 0');
    existingProduct.stock = 0;
  }

  if (isNaN(existingProduct.basePrice) || existingProduct.basePrice === undefined) {
    console.log('⚠️ basePrice was NaN, setting to 0');
    existingProduct.basePrice = 0;
  }

  console.log('💾 Saving product with stock:', existingProduct.stock);
  const updatedProduct = await existingProduct.save();

  console.log('✅ Product updated successfully:', {
    id: updatedProduct._id,
    name: updatedProduct.name,
    stock: updatedProduct.stock,
    mainImagesCount: updatedProduct.images?.length || 0,
    variantImages: updatedProduct.variants?.map(v => v.images?.length || 0) || [],
    imagesChanged: imagesChanged,
    hasOffer: updatedProduct.hasOffer
  });

  reply.status(200).send({
    success: true,
    message: 'Product updated successfully.',
    data: updatedProduct,
  });
};

// ============================================
// DELETE PRODUCT
// ============================================
export const deleteProduct = async (req, reply) => {
  const id = req.params.id?.trim();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid product ID.', {
      field: 'id',
      received: id
    });
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new NotFoundError('Product', { id });
  }

  let deletedCount = 0;

  if (product.images && product.images.length > 0) {
    product.images.forEach(img => {
      if (deleteImageFile(img.image)) {
        deletedCount++;
      }
    });
    console.log(`🗑️ Deleted ${product.images.length} main images from upload folder`);
  }

  if (product.variants && product.variants.length > 0) {
    let variantImageCount = 0;
    product.variants.forEach(variant => {
      if (variant.images && variant.images.length > 0) {
        variant.images.forEach(img => {
          if (deleteImageFile(img.image)) {
            variantImageCount++;
          }
        });
      }
    });
    deletedCount += variantImageCount;
    console.log(`🗑️ Deleted ${variantImageCount} variant images from upload folder`);
  }

  if (product.ogImage && product.ogImage.startsWith('/uploads/')) {
    if (deleteImageFile(product.ogImage)) {
      deletedCount++;
      console.log('🗑️ Deleted OG image from upload folder');
    }
  }

  await Product.findByIdAndDelete(id);

  console.log(`✅ Total deleted: ${deletedCount} image files from upload folder`);
  console.log(`✅ Product deleted from database: ${id}`);

  reply.status(200).send({
    success: true,
    message: `Product deleted successfully. Removed ${deletedCount} image files from server.`,
    deletedImages: deletedCount
  });
};

// ============================================
// UPLOAD VARIANT IMAGES
// ============================================
export const uploadVariantImages = async (req, reply) => {
  const { productId, variantIndex } = req.params;

  if (!req.files || req.files.length === 0) {
    throw new ValidationError('No images uploaded', {
      field: 'files'
    });
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new NotFoundError('Product', { id: productId });
  }

  const index = parseInt(variantIndex);
  if (index < 0 || index >= product.variants.length) {
    throw new ValidationError('Invalid variant index', {
      variantIndex: index,
      totalVariants: product.variants.length
    });
  }

  const newImages = req.files.map(file => ({
    image: `/uploads/${file.filename}`
  }));

  if (!product.variants[index].images) {
    product.variants[index].images = [];
  }

  product.variants[index].images.push(...newImages);
  await product.save();

  reply.status(200).send({
    success: true,
    message: 'Variant images uploaded successfully',
    data: product.variants[index]
  });
};

// ============================================
// GET ALL PRODUCTS
// ============================================
export const getAllProducts = async (req, reply) => {
  const {
    category,
    categorySlug,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    hasOffer
  } = req.query;

  let filter = {};

  if (hasOffer !== undefined && hasOffer !== '') {
    if (hasOffer === 'true' || hasOffer === true) {
      filter.hasOffer = true;
      console.log('🎯 Filtering products with offers only');
    } else if (hasOffer === 'false' || hasOffer === false) {
      filter.hasOffer = false;
      console.log('🎯 Filtering products without offers');
    }
  }

  const categoryFilter = categorySlug || category;

  if (categoryFilter && categoryFilter !== 'undefined' && categoryFilter !== 'all') {
    if (mongoose.Types.ObjectId.isValid(categoryFilter)) {
      filter.category = categoryFilter;
    } else {
      const categoryDoc = await Category.findOne({
        slug: categoryFilter,
        status: 'active'
      });

      if (categoryDoc) {
        filter.category = categoryDoc._id;
      } else {
        return reply.status(200).send({
          success: true,
          data: [],
          count: 0,
          message: 'No products found for this category'
        });
      }
    }
  }

  const sortConfig = {};
  switch (sortBy) {
    case 'price':
    case 'rating':
    case 'createdAt':
    case 'name':
      sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;
      break;
    default:
      sortConfig.createdAt = -1;
  }

  console.log('🔍 Product filter:', filter);
  console.log('🔄 Sort config:', sortConfig);

  const products = await Product.find(filter)
    .populate('category', 'name slug')
    .sort(sortConfig);

  if (products.length > 0) {
    console.log('📊 Sample product fields:', Object.keys(products[0].toObject()));
    console.log('📊 Has offer:', products[0].hasOffer);
    console.log('📊 Total products found:', products.length);
  }

  reply.status(200).send({
    success: true,
    count: products.length,
    data: products,
  });
};

// ============================================
// GET PRODUCT BY ID
// ============================================
export const getProductById = async (req, reply) => {
  const id = req.params.id?.trim();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid product ID.', {
      field: 'id',
      received: id
    });
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new NotFoundError('Product', { id });
  }

  reply.status(200).send({ success: true, data: product });
};

// ============================================
// GET PRODUCT BY SLUG
// ============================================
export const getProductBySlug = async (req, reply) => {
  const { slug } = req.params;

  const product = await Product.findOne({ slug })
    .populate('category', 'name slug');

  if (!product) {
    throw new NotFoundError('Product', { slug });
  }

  reply.status(200).send({ success: true, data: product });
};

// ============================================
// GET FEATURED PRODUCTS
// ============================================
export const getFeaturedProducts = async (req, reply) => {
  const { priceRange, category, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  let filter = { featured: true, status: 'active' };

  if (category && category !== 'all') {
    filter.category = category;
  }

  let priceFilter = {};
  if (priceRange && priceRange !== 'all') {
    switch (priceRange) {
      case '100-200':
        priceFilter = { price: { $gte: 100, $lte: 200 } };
        break;
      case '200-300':
        priceFilter = { price: { $gte: 200, $lte: 300 } };
        break;
      case '300-400':
        priceFilter = { price: { $gte: 300, $lte: 400 } };
        break;
      case '400-500':
        priceFilter = { price: { $gte: 400, $lte: 500 } };
        break;
      case '500-600':
        priceFilter = { price: { $gte: 500, $lte: 600 } };
        break;
      case 'above-600':
        priceFilter = { price: { $gt: 600 } };
        break;
      default:
        priceFilter = {};
    }
  }

  const finalFilter = { ...filter, ...priceFilter };

  const sortConfig = {};
  sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const products = await Product.find(finalFilter)
    .populate('category', 'name slug')
    .sort(sortConfig)
    .lean();

  reply.status(200).send({
    success: true,
    count: products.length,
    data: products
  });
};

// ============================================
// GET FEATURED PRICE RANGES
// ============================================
export const getFeaturedPriceRanges = async (req, reply) => {
  const priceRanges = await Product.aggregate([
    {
      $match: {
        featured: true,
        status: 'active',
        price: { $exists: true, $ne: null }
      }
    },
    {
      $bucket: {
        groupBy: "$price",
        boundaries: [0, 100, 200, 300, 400, 500, 600, Number.MAX_SAFE_INTEGER],
        default: "above-600",
        output: {
          count: { $sum: 1 },
          minPrice: { $min: "$price" },
          maxPrice: { $max: "$price" }
        }
      }
    },
    {
      $project: {
        _id: 0,
        range: {
          $switch: {
            branches: [
              { case: { $eq: ["$_id", 0] }, then: "under-100" },
              { case: { $eq: ["$_id", 100] }, then: "100-200" },
              { case: { $eq: ["$_id", 200] }, then: "200-300" },
              { case: { $eq: ["$_id", 300] }, then: "300-400" },
              { case: { $eq: ["$_id", 400] }, then: "400-500" },
              { case: { $eq: ["$_id", 500] }, then: "500-600" },
              { case: { $eq: ["$_id", 600] }, then: "above-600" }
            ],
            default: "above-600"
          }
        },
        count: 1,
        minPrice: 1,
        maxPrice: 1
      }
    },
    {
      $match: {
        count: { $gt: 0 }
      }
    }
  ]);

  reply.status(200).send({
    success: true,
    data: priceRanges
  });
};

// ============================================
// GET FILTERED FEATURED PRODUCTS
// ============================================
export const getFilteredFeaturedProducts = async (req, reply) => {
  const {
    priceRanges,
    categories,
    minPrice,
    maxPrice,
    page = 1,
    limit = 12,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  let filter = { featured: true, status: 'active' };

  if (categories && categories !== 'all') {
    const categoryArray = Array.isArray(categories) ? categories : [categories];
    filter.category = { $in: categoryArray };
  }

  let priceFilter = {};

  if (priceRanges && priceRanges !== 'all') {
    const rangeArray = Array.isArray(priceRanges) ? priceRanges : [priceRanges];
    const rangeConditions = [];

    rangeArray.forEach(range => {
      switch (range) {
        case '100-200':
          rangeConditions.push({ price: { $gte: 100, $lte: 200 } });
          break;
        case '200-300':
          rangeConditions.push({ price: { $gte: 200, $lte: 300 } });
          break;
        case '300-400':
          rangeConditions.push({ price: { $gte: 300, $lte: 400 } });
          break;
        case '400-500':
          rangeConditions.push({ price: { $gte: 400, $lte: 500 } });
          break;
        case '500-600':
          rangeConditions.push({ price: { $gte: 500, $lte: 600 } });
          break;
        case 'above-600':
          rangeConditions.push({ price: { $gt: 600 } });
          break;
      }
    });

    if (rangeConditions.length > 0) {
      priceFilter = { $or: rangeConditions };
    }
  }

  if (minPrice || maxPrice) {
    priceFilter = {};
    if (minPrice) priceFilter.$gte = parseInt(minPrice);
    if (maxPrice) priceFilter.$lte = parseInt(maxPrice);
    priceFilter = { price: priceFilter };
  }

  const finalFilter = priceFilter ? { ...filter, ...priceFilter } : filter;

  const sortConfig = {};
  sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [products, totalCount] = await Promise.all([
    Product.find(finalFilter)
      .populate('category', 'name slug')
      .sort(sortConfig)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Product.countDocuments(finalFilter)
  ]);

  reply.status(200).send({
    success: true,
    data: products,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      totalProducts: totalCount,
      hasNext: skip + products.length < totalCount,
      hasPrev: parseInt(page) > 1
    }
  });
};

// ============================================
// SEARCH PRODUCTS
// ============================================
export const searchProducts = async (req, reply) => {
  const {
    search,
    category,
    categorySlug,
    minPrice,
    maxPrice,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 12
  } = req.query;

  let filter = { status: 'active' };

  if (search && search.trim() !== '') {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const categoryFilter = categorySlug || category;

  if (categoryFilter && categoryFilter !== 'all' && categoryFilter !== 'undefined') {
    if (mongoose.Types.ObjectId.isValid(categoryFilter)) {
      filter.category = categoryFilter;
    } else {
      const categoryDoc = await Category.findOne({
        slug: categoryFilter,
        status: 'active'
      });

      if (categoryDoc) {
        filter.category = categoryDoc._id;
      }
    }
  }

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = parseFloat(minPrice);
    if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
  }

  const sortConfig = {};
  sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [products, totalCount] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .sort(sortConfig)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Product.countDocuments(filter)
  ]);

  reply.status(200).send({
    success: true,
    data: products,
    count: products.length,
    totalCount,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      totalProducts: totalCount,
      hasNext: skip + products.length < totalCount,
      hasPrev: parseInt(page) > 1
    }
  });
};

// ============================================
// QUICK SEARCH PRODUCTS
// ============================================
export const quickSearchProducts = async (req, reply) => {
  const { q: searchQuery, limit = 5 } = req.query;

  console.log('🔍 Quick search query:', searchQuery);

  if (!searchQuery || searchQuery.trim() === '') {
    return reply.status(200).send({
      success: true,
      data: [],
      message: 'Please enter a search term'
    });
  }

  const products = await Product.find({
    name: { $regex: searchQuery.trim(), $options: 'i' },
    status: 'active'
  })
    .select('name slug price images ogImage category featured')
    .populate('category', 'name slug')
    .limit(parseInt(limit))
    .lean();

  console.log('📦 Found products:', products.length);

  const formattedProducts = products.map(product => {
    let imageUrl = null;
    if (product.images && product.images.length > 0 && product.images[0].image) {
      imageUrl = product.images[0].image;
    } else if (product.ogImage) {
      imageUrl = product.ogImage;
    }

    return {
      _id: product._id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      image: imageUrl,
      category: product.category?.name || 'Uncategorized',
      featured: product.featured || false
    };
  });

  reply.status(200).send({
    success: true,
    data: formattedProducts,
    count: formattedProducts.length
  });
};

// ============================================
// GET OFFER PRODUCTS
// ============================================
export const getOfferProducts = async (req, reply) => {
  const {
    category,
    minDiscount = 0,
    maxDiscount = 100,
    limit = 20,
    sort = 'discount-desc'
  } = req.query;

  const filter = {
    hasOffer: true,
    discountPercentage: {
      $gte: parseFloat(minDiscount),
      $lte: parseFloat(maxDiscount)
    },
    status: 'active'
  };

  if (category && category !== 'all') {
    if (mongoose.Types.ObjectId.isValid(category)) {
      filter.category = category;
    } else {
      const categoryDoc = await Category.findOne({ slug: category, status: 'active' });
      if (categoryDoc) {
        filter.category = categoryDoc._id;
      }
    }
  }

  let sortConfig = {};
  switch (sort) {
    case 'discount-desc':
      sortConfig = { discountPercentage: -1 };
      break;
    case 'price-asc':
      sortConfig = { basePrice: 1 };
      break;
    case 'price-desc':
      sortConfig = { basePrice: -1 };
      break;
    case 'new':
      sortConfig = { createdAt: -1 };
      break;
    default:
      sortConfig = { discountPercentage: -1 };
  }

  const products = await Product.find(filter)
    .populate('category', 'name slug')
    .sort(sortConfig)
    .limit(parseInt(limit))
    .lean();

  const formattedProducts = products.map(product => ({
    ...product,
    savingsAmount: product.originalPrice - product.basePrice,
    hasOffer: true
  }));

  reply.status(200).send({
    success: true,
    count: products.length,
    data: formattedProducts
  });
};