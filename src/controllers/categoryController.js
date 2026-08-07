const CategoryService = require('../services/categoryService');
const Product = require('../models/productModel');
const Category = require('../models/categoryModel');
const User = require('../models/userModel');
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
                attributes: [
                    'id',
                    'name',
                    'note',
                    'created_by',
                    'updated_by',
                    'created_at',
                    'updated_at',
                    [
                        sequelize.fn(
                            'COUNT',
                            sequelize.col('products.id')
                        ),
                        'product_count'
                    ]
                ],
                include: [
                    {
                        model: Product,
                        as: 'products',
                        attributes: []
                    },
                    {
                        model: User,
                        as: 'creator',
                        attributes: ['id', 'name', 'email']
                    },
                    {
                        model: User,
                        as: 'updater',
                        attributes: ['id', 'name', 'email']
                    }
                ],
                group: ['Category.id', 'creator.id', 'updater.id']
            });

            return successResponse(
                res,
                'Categories retrieved successfully',
                categories
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