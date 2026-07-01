const CategoryService = require('../services/categoryService');
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
            const Categorys = await CategoryService.getAllCategorys();

            return successResponse(
                res,
                'Categorys retrieved successfully',
                Categorys
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