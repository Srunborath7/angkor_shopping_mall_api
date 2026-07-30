const { ProductImage } = require("../models/relationships");

class ProductImageService {
    async upload(productId, data) {
        const isPrimary = data.is_primary === "true" || data.is_primary === true;

        if (isPrimary) {
            // Set other images of this product to not primary
            await ProductImage.update(
                { is_primary: false },
                { where: { product_id: productId } }
            );
        }

        return await ProductImage.create({
            product_id: productId,
            product_variant_id: data.product_variant_id || null,
            image_url: data.image_url,
            image_path: data.image_path || null,
            is_primary: isPrimary
        });
    }

    async findAll(productId) {
        return await ProductImage.findAll({
            where: { product_id: productId }
        });
    }

    async destroy(id) {
        const image = await ProductImage.findByPk(id);
        if (!image) {
            throw new Error("Product image not found");
        }
        return image;
    }
}

module.exports = new ProductImageService();
