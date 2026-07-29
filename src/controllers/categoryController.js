const CategoryService = require('../services/categoryService');
const Product = require('../models/productModel');
const Category = require('../models/categoryModel')
const sequelize = require('../config/db');
const {
    successResponse,
    errorResponse
} = require('../utils/response');

class CategoryController {

    async create(req, res) {
        try {
            const Category = await CategoryService.createCategory(req.body);

            return successResponse(
                res,
                'Category created successfully',
                Category
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
                    }
                ],
                group: ['Category.id']
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
            const Category = await CategoryService.getCategoryById(req.params.id);

            if (!Category) {
                return errorResponse(res, 'Category not found');
            }

            return successResponse(
                res,
                'Category retrieved successfully',
                Category
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async update(req, res) {
        try {
            const Category = await CategoryService.updateCategory(
                req.params.id,
                req.body
            );

            return successResponse(
                res,
                'Category updated successfully',
                Category
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