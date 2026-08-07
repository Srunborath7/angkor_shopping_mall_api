const purchaseOrderService = require('../services/purchaseOrderService');
const { successResponse, errorResponse } = require('../utils/response');

class PurchaseOrderController {
    async create(req, res) {
        try {
            const data = { ...req.body };
            if (req.user && req.user.id) {
                data.created_by = req.user.id;
            }

            const purchaseOrder = await purchaseOrderService.createPurchaseOrder(data);
            return successResponse(res, 'Purchase order created successfully', purchaseOrder, 201);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findAll(req, res) {
        try {
            const purchaseOrders = await purchaseOrderService.getAllPurchaseOrders();
            return successResponse(res, 'Purchase orders retrieved successfully', purchaseOrders);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findOne(req, res) {
        try {
            const purchaseOrder = await purchaseOrderService.getPurchaseOrderById(req.params.id);
            return successResponse(res, 'Purchase order retrieved successfully', purchaseOrder);
        } catch (error) {
            return errorResponse(res, error.message, error.message === 'Purchase Order not found' ? 404 : 400);
        }
    }

    async updateStatus(req, res) {
        try {
            const { status } = req.body;
            const updated_by = req.user?.id;

            const purchaseOrder = await purchaseOrderService.updateStatus(req.params.id, status, updated_by);
            return successResponse(res, `Purchase order status updated to ${status}`, purchaseOrder);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async delete(req, res) {
        try {
            await purchaseOrderService.deletePurchaseOrder(req.params.id);
            return successResponse(res, 'Purchase order deleted successfully');
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new PurchaseOrderController();
