// controllers/categoryController.js
import Category from '../models/Category.js';
import Product from '../models/productModel.js';
import mongoose from 'mongoose';
import slugify from 'slugify';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  BusinessLogicError
} from '../utils/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Save uploaded file as WebP
const saveUploadedFile = async (file) => {
    try {
        const uploadsDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const timestamp = Date.now();
        const random = Math.round(Math.random() * 1E9);
        const filename = `${timestamp}-${random}.webp`;
        const filePath = path.join(uploadsDir, filename);

        const buffer = await file.toBuffer();
        
        // ✅ Convert to WebP using sharp
        const sharp = await import('sharp');
        const webpBuffer = await sharp.default(buffer)
            .webp({ quality: 80 })
            .toBuffer();
        
        fs.writeFileSync(filePath, webpBuffer);

        return `/uploads/${filename}`;
    } catch (error) {
        console.error('❌ Error saving file:', error);
        return null;
    }
};

// ✅ Delete file
const deleteFile = (filePath) => {
    if (!filePath) return false;
    try {
        const fullPath = path.join(process.cwd(), filePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`✅ Deleted: ${filePath}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('❌ Error deleting file:', error);
        return false;
    }
};

// ✅ 1. CREATE CATEGORY
export const createCategory = async (req, reply) => {
    const { name, description, parent, status, featured, metaTitle, metaDescription, metaKeywords, displayOrder } = req.body;

    if (!name || !name.trim()) {
        throw new ValidationError('Category name is required', {
            field: 'name',
            required: true
        });
    }

    const existingCategory = await Category.findOne({ name: name.trim() });
    if (existingCategory) {
        throw new ConflictError('Category with this name already exists', {
            name: name.trim()
        });
    }

    // ✅ Save image without folders
    let imagePath = null;
    if (req.uploadedFile) {
        imagePath = await saveUploadedFile(req.uploadedFile);
    }

    const slug = slugify(name.trim(), { lower: true, strict: true });
    let finalSlug = slug;
    let counter = 1;
    while (await Category.findOne({ slug: finalSlug })) {
        finalSlug = `${slug}-${counter}`;
        counter++;
    }

    let parsedMetaKeywords = [];
    if (metaKeywords) {
        if (Array.isArray(metaKeywords)) {
            parsedMetaKeywords = metaKeywords;
        } else if (typeof metaKeywords === 'string') {
            parsedMetaKeywords = metaKeywords.split(',').map(k => k.trim()).filter(Boolean);
        }
    }

    const category = new Category({
        name: name.trim(),
        slug: finalSlug,
        description: description || '',
        parent: parent || null,
        image: imagePath,
        status: status || 'active',
        featured: featured === 'true' || featured === true,
        metaTitle: metaTitle || '',
        metaDescription: metaDescription || '',
        metaKeywords: parsedMetaKeywords,
        displayOrder: parseInt(displayOrder) || 0,
        createdBy: req.user.id
    });

    await category.save();

    reply.status(201).send({
        success: true,
        message: 'Category created successfully',
        data: category
    });
};

// ✅ 2. GET ALL CATEGORIES
export const getAllCategories = async (req, reply) => {
    const { status, featured, parent } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (featured === 'true') filter.featured = true;
    if (parent) filter.parent = parent === 'null' ? null : parent;

    const categories = await Category.find(filter)
        .populate('parent', 'name slug')
        .sort('displayOrder name');

    reply.status(200).send({
        success: true,
        count: categories.length,
        data: categories
    });
};

// ✅ 3. GET ACTIVE CATEGORIES
export const getActiveCategories = async (req, reply) => {
    const categories = await Category.find({ status: 'active' })
        .populate('parent', 'name slug')
        .sort('displayOrder name');

    reply.status(200).send({
        success: true,
        count: categories.length,
        data: categories
    });
};

// ✅ 4. GET CATEGORY BY ID
export const getCategoryById = async (req, reply) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('Invalid category ID', {
            field: 'id',
            received: id
        });
    }

    const category = await Category.findById(id)
        .populate('parent', 'name slug')
        .populate('subcategories', 'name slug image');

    if (!category) {
        throw new NotFoundError('Category', { id });
    }

    reply.status(200).send({
        success: true,
        data: category
    });
};

// ✅ 5. UPDATE CATEGORY
export const updateCategory = async (req, reply) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('Invalid category ID', {
            field: 'id',
            received: id
        });
    }

    const category = await Category.findById(id);
    if (!category) {
        throw new NotFoundError('Category', { id });
    }

    const { name, description, parent, status, featured, metaTitle, metaDescription, metaKeywords, displayOrder, deleteImage } = req.body;

    // ✅ Handle image deletion
    if (deleteImage === 'true' || deleteImage === true) {
        if (category.image) {
            deleteFile(category.image);
            category.image = null;
        }
    }

    // ✅ Handle new image (replaces old)
    if (req.uploadedFile) {
        if (category.image) {
            deleteFile(category.image);
        }
        category.image = await saveUploadedFile(req.uploadedFile);
    }

    // ✅ Update fields
    if (name && name.trim()) {
        category.name = name.trim();
        const slug = slugify(name.trim(), { lower: true, strict: true });
        let finalSlug = slug;
        let counter = 1;
        while (await Category.findOne({ slug: finalSlug, _id: { $ne: id } })) {
            finalSlug = `${slug}-${counter}`;
            counter++;
        }
        category.slug = finalSlug;
    }
    if (description !== undefined) category.description = description;
    if (parent !== undefined) category.parent = parent === 'null' ? null : parent;
    if (status) category.status = status;
    if (featured !== undefined) category.featured = featured === 'true' || featured === true;
    if (metaTitle !== undefined) category.metaTitle = metaTitle;
    if (metaDescription !== undefined) category.metaDescription = metaDescription;
    if (displayOrder !== undefined) category.displayOrder = parseInt(displayOrder) || 0;

    if (metaKeywords !== undefined) {
        if (Array.isArray(metaKeywords)) {
            category.metaKeywords = metaKeywords;
        } else if (typeof metaKeywords === 'string') {
            category.metaKeywords = metaKeywords.split(',').map(k => k.trim()).filter(Boolean);
        }
    }

    await category.save();

    reply.status(200).send({
        success: true,
        message: 'Category updated successfully',
        data: category
    });
};

// ✅ 6. DELETE CATEGORY
export const deleteCategory = async (req, reply) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('Invalid category ID', {
            field: 'id',
            received: id
        });
    }

    const category = await Category.findById(id);
    if (!category) {
        throw new NotFoundError('Category', { id });
    }

    const subcategories = await Category.find({ parent: id });
    if (subcategories.length > 0) {
        throw new BusinessLogicError(
            `Cannot delete category with ${subcategories.length} subcategory(s)`,
            {
                subcategoriesCount: subcategories.length,
                subcategories: subcategories.map(s => s.name)
            }
        );
    }

    const productsCount = await Product.countDocuments({ category: id });
    if (productsCount > 0) {
        throw new BusinessLogicError(
            `Cannot delete category with ${productsCount} product(s)`,
            {
                productsCount: productsCount,
                categoryId: id
            }
        );
    }

    if (category.image) {
        deleteFile(category.image);
    }

    await Category.findByIdAndDelete(id);

    reply.status(200).send({
        success: true,
        message: 'Category deleted successfully'
    });
};

// ✅ 7. GET CATEGORIES TREE
export const getCategoriesTree = async (req, reply) => {
    const categories = await Category.find({ status: 'active' }).sort('displayOrder name');
    
    const categoryMap = {};
    const roots = [];

    categories.forEach(category => {
        categoryMap[category._id] = { ...category.toObject(), children: [] };
    });

    categories.forEach(category => {
        if (category.parent && categoryMap[category.parent]) {
            categoryMap[category.parent].children.push(categoryMap[category._id]);
        } else {
            roots.push(categoryMap[category._id]);
        }
    });

    reply.status(200).send({
        success: true,
        data: roots
    });
};

// ✅ 8. GET CATEGORY PRODUCTS
export const getCategoryProducts = async (req, reply) => {
    const { id } = req.params;
    const { page = 1, limit = 12, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('Invalid category ID', {
            field: 'id',
            received: id
        });
    }

    const category = await Category.findById(id);
    if (!category) {
        throw new NotFoundError('Category', { id });
    }

    const subcategories = await Category.find({ parent: id, status: 'active' });
    const categoryIds = [id, ...subcategories.map(sub => sub._id)];

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortConfig = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [products, totalCount] = await Promise.all([
        Product.find({ category: { $in: categoryIds }, status: 'active' })
            .populate('category', 'name slug')
            .sort(sortConfig)
            .skip(skip)
            .limit(parseInt(limit))
            .lean(),
        Product.countDocuments({ category: { $in: categoryIds }, status: 'active' })
    ]);

    reply.status(200).send({
        success: true,
        category: { _id: category._id, name: category.name, slug: category.slug },
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