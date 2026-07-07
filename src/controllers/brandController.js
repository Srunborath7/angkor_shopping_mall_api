const BrandService = require('../services/brandService');

const {
    successResponse,
    errorResponse
} = require('../utils/response');

class BrandController {

    async create(req, res) {
        try {
            const brand = await BrandService.createBrand(req.body);

            return successResponse(
                res,
                'Brand created successfully',
                brand
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findAll(req, res) {
        try {
            const brands = await BrandService.getAllBrands();

            return successResponse(
                res,
                'Brands retrieved successfully',
                brands
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findOne(req, res) {
        try {
            const brand = await BrandService.getBrandById(req.params.id);

            if (!brand) {
                return errorResponse(res, 'Brand not found');
            }

            return successResponse(
                res,
                'Brand retrieved successfully',
                brand
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async update(req, res) {
        try {
            const brand = await BrandService.updateBrand(
                req.params.id,
                req.body
            );

            return successResponse(
                res,
                'Brand updated successfully',
                brand
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async delete(req, res) {
        try {
            await BrandService.deleteBrand(req.params.id);

            return successResponse(
                res,
                'Brand deleted successfully'
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new BrandController();