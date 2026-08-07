const supplierService = require('../services/supplierService');
const { successResponse, errorResponse } = require('../utils/response');

class SupplierController {
    async create(req, res) {
        try {
            const data = { ...req.body };
            if (req.user && req.user.id) {
                data.created_by = req.user.id;
            }

            const supplier = await supplierService.createSupplier(data);
            return successResponse(res, 'Supplier created successfully', supplier, 201);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findAll(req, res) {
        try {
            const suppliers = await supplierService.getAllSuppliers();
            return successResponse(res, 'Suppliers retrieved successfully', suppliers);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findOne(req, res) {
        try {
            const supplier = await supplierService.getSupplierById(req.params.id);
            return successResponse(res, 'Supplier retrieved successfully', supplier);
        } catch (error) {
            return errorResponse(res, error.message, error.message === 'Supplier not found' ? 404 : 400);
        }
    }

    async update(req, res) {
        try {
            const data = { ...req.body };
            if (req.user && req.user.id) {
                data.updated_by = req.user.id;
            }

            const supplier = await supplierService.updateSupplier(req.params.id, data);
            return successResponse(res, 'Supplier updated successfully', supplier);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async delete(req, res) {
        try {
            await supplierService.deleteSupplier(req.params.id);
            return successResponse(res, 'Supplier deleted successfully');
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new SupplierController();
