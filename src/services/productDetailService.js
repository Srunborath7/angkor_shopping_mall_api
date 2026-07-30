const { ProductDetail } = require("../models/relationships");

class ProductDetailService {
    async upsert(productId, data) {
        const [detail, created] = await ProductDetail.findOrCreate({
            where: { product_id: productId },
            defaults: {
                long_description: data.long_description,
                specifications: data.specifications || {},
                warranty_info: data.warranty_info,
                shipping_info: data.shipping_info
            }
        });

        if (!created) {
            await detail.update({
                long_description: data.long_description !== undefined ? data.long_description : detail.long_description,
                specifications: data.specifications !== undefined ? data.specifications : detail.specifications,
                warranty_info: data.warranty_info !== undefined ? data.warranty_info : detail.warranty_info,
                shipping_info: data.shipping_info !== undefined ? data.shipping_info : detail.shipping_info
            });
        }

        return detail;
    }

    async findOne(productId) {
        const detail = await ProductDetail.findOne({
            where: { product_id: productId }
        });
        if (!detail) {
            throw new Error("Product detail not found");
        }
        return detail;
    }
}

module.exports = new ProductDetailService();
