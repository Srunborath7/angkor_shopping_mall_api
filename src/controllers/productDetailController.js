const productDetailService = require("../services/productDetailService");
const { successResponse, errorResponse } = require("../utils/response");

class ProductDetailController {
    async upsert(req, res) {
        try {
            const { productId } = req.params;
            const { long_description, specifications, warranty_info, shipping_info } = req.body;

            let parsedSpecs = specifications;
            if (typeof specifications === "string") {
                try {
                    parsedSpecs = JSON.parse(specifications);
                } catch (e) {
                    parsedSpecs = {};
                }
            }

            const detail = await productDetailService.upsert(productId, {
                long_description,
                specifications: parsedSpecs,
                warranty_info,
                shipping_info
            });

            return successResponse(res, "Product detail updated successfully", detail);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findOne(req, res) {
        try {
            const { productId } = req.params;
            const detail = await productDetailService.findOne(productId);
            return successResponse(res, "Product detail fetched successfully", detail);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new ProductDetailController();
