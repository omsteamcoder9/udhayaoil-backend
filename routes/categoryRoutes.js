// routes/categoryRoutes.js
import {
    createCategory,
    getAllCategories,
    getCategoryById,
    updateCategory,
    deleteCategory,
    getCategoriesTree,
    getCategoryProducts,
    getActiveCategories  
} from '../controller/categoryController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

export default async function categoryRoutes(fastify, opts) {
    console.log('🔵 Registering category routes...');

    fastify.get('/', { handler: getAllCategories });
    fastify.get('/tree', { handler: getCategoriesTree });
    fastify.get('/active', { handler: getActiveCategories });
    fastify.get('/:id', { handler: getCategoryById });
    fastify.get('/:id/products', { handler: getCategoryProducts });

    // ✅ POST - Working with Fastify multipart
    fastify.post('/', {
        preValidation: [protect, authorize('admin')],
        handler: async (req, reply) => {
            try {
                const fields = {};
                let uploadedFile = null;
                
                // ✅ Extract values from field objects
                for (const key of Object.keys(req.body || {})) {
                    const field = req.body[key];
                    if (field && typeof field === 'object' && field.value !== undefined) {
                        fields[key] = field.value;
                    } else if (field !== undefined && field !== null) {
                        fields[key] = field;
                    }
                }
                
                // ✅ Get file from req.body.image
                if (req.body && req.body.image && req.body.image.file) {
                    uploadedFile = req.body.image;
                }
                
                req.body = fields;
                req.uploadedFile = uploadedFile;
                
                return createCategory(req, reply);
            } catch (error) {
                console.error('❌ Handler error:', error);
                return reply.status(500).send({
                    success: false,
                    message: error.message || 'Server error'
                });
            }
        }
    });

    fastify.put('/:id', {
        preValidation: [protect, authorize('admin')],
        handler: async (req, reply) => {
            try {
                const fields = {};
                let uploadedFile = null;
                
                for (const key of Object.keys(req.body || {})) {
                    const field = req.body[key];
                    if (field && typeof field === 'object' && field.value !== undefined) {
                        fields[key] = field.value;
                    } else if (field !== undefined && field !== null) {
                        fields[key] = field;
                    }
                }
                
                if (req.body && req.body.image && req.body.image.file) {
                    uploadedFile = req.body.image;
                }
                
                req.body = fields;
                req.uploadedFile = uploadedFile;
                
                return updateCategory(req, reply);
            } catch (error) {
                console.error('❌ Handler error:', error);
                return reply.status(500).send({
                    success: false,
                    message: error.message || 'Server error'
                });
            }
        }
    });

    fastify.delete('/:id', {
        preValidation: [protect, authorize('admin')]
    }, deleteCategory);

    console.log('✅ Category routes registered');
}