const flashSaleService = require('../services/flashSaleService');
const { successResponse, errorResponse } = require('../utils/response');

class FlashSaleController {
    async create(req, res) {
        try {
            const sale = await flashSaleService.create(req.body);
            return successResponse(res, 'Flash Sale created successfully', sale, 201);
        } catch (err) {
            return errorResponse(res, err.message);
        }
    }

    async findAll(req, res) {
        try {
            const sales = await flashSaleService.findAll();
            return successResponse(res, 'Flash sales retrieved successfully', sales);
        } catch (err) {
            return errorResponse(res, err.message);
        }
    }

    async findActive(req, res) {
        try {
            const sales = await flashSaleService.findActive();
            return successResponse(res, 'Active flash sales retrieved successfully', sales);
        } catch (err) {
            return errorResponse(res, err.message);
        }
    }

    async update(req, res) {
        try {
            const sale = await flashSaleService.update(req.params.id, req.body);
            return successResponse(res, 'Flash sale updated successfully', sale);
        } catch (err) {
            return errorResponse(res, err.message);
        }
    }

    async delete(req, res) {
        try {
            await flashSaleService.delete(req.params.id);
            return successResponse(res, 'Flash sale deleted successfully');
        } catch (err) {
            return errorResponse(res, err.message);
        }
    }
}

module.exports = new FlashSaleController();
