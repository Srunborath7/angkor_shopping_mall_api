const CategoryService = require('../services/categoryService');
const Product = require('../models/productModel');
const Category = require('../models/categoryModel');
const sequelize = require('../config/db');
const {
    successResponse,
    errorResponse
} = require('../utils/response');

class CategoryController {
    async create(req, res) {
        try {
            const data = { ...req.body };
            if (req.user && req.user.id) {
                data.created_by = req.user.id;
            }

            const category = await CategoryService.createCategory(data);

            return successResponse(
                res,
                'Category created successfully',
                category
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findAll(req, res) {
        try {
            const categories = await Category.findAll({
                order: [['created_at', 'DESC']],
                raw: true
            });

            // Efficient product count per category
            const productCounts = await Product.findAll({
                attributes: [
                    'category_id',
                    [sequelize.fn('COUNT', sequelize.col('id')), 'product_count']
                ],
                group: ['category_id'],
                raw: true
            });

            const countMap = new Map(productCounts.map(pc => [pc.category_id, parseInt(pc.product_count) || 0]));

            const formatted = categories.map(cat => ({
                ...cat,
                product_count: countMap.get(cat.id) || 0
            }));

            return successResponse(
                res,
                'Categories retrieved successfully',
                formatted
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findOne(req, res) {
        try {
            const category = await CategoryService.getCategoryById(req.params.id);

            if (!category) {
                return errorResponse(res, 'Category not found');
            }

            return successResponse(
                res,
                'Category retrieved successfully',
                category
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async update(req, res) {
        try {
            const data = { ...req.body };
            if (req.user && req.user.id) {
                data.updated_by = req.user.id;
            }

            const category = await CategoryService.updateCategory(
                req.params.id,
                data
            );

            return successResponse(
                res,
                'Category updated successfully',
                category
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async delete(req, res) {
        try {
            await CategoryService.deleteCategory(req.params.id);

            return successResponse(
                res,
                'Category deleted successfully'
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new CategoryController();
