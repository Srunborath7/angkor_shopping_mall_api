const { ProductVariant, ProductImage } = require("../models/relationships");

class ProductVariantService {
    async create(productId, data) {
        // Check if SKU exists
        const existingVariant = await ProductVariant.findOne({ where: { sku: data.sku } });
        if (existingVariant) {
            throw new Error("SKU already exists");
        }

        const variant = await ProductVariant.create({
            sku: data.sku,
            price: data.price,
            stock_quantity: data.stock_quantity,
            attributes: data.attributes,
            is_active: data.is_active,
            product_id: productId
        });

        if (data.image_url) {
            await ProductImage.create({
                product_id: productId,
                product_variant_id: variant.id,
                image_url: data.image_url,
                image_path: data.image_path || null,
                is_primary: false
            });
        }

        return variant;
    }

    async findAll(productId) {
        return await ProductVariant.findAll({
            where: { product_id: productId }
        });
    }

    async findOne(id) {
        const variant = await ProductVariant.findByPk(id);
        if (!variant) {
            throw new Error("Variant not found");
        }
        return variant;
    }

    async update(id, data) {
        const variant = await this.findOne(id);

        if (data.sku && data.sku !== variant.sku) {
            const existingVariant = await ProductVariant.findOne({ where: { sku: data.sku } });
            if (existingVariant) {
                throw new Error("SKU already exists");
            }
        }

        await variant.update(data);

        if (data.image_url) {
            const [varImg, created] = await ProductImage.findOrCreate({
                where: { product_variant_id: id },
                defaults: {
                    product_id: variant.product_id,
                    image_url: data.image_url,
                    image_path: data.image_path || null,
                    is_primary: false
                }
            });

            if (!created) {
                await varImg.update({
                    image_url: data.image_url,
                    image_path: data.image_path || null
                });
            }
        }

        return variant;
    }

    async updateInventory(id, stock_quantity) {
        const variant = await this.findOne(id);
        await variant.update({ stock_quantity });
        return variant;
    }

    async destroy(id) {
        const variant = await this.findOne(id);
        await variant.destroy();
        return { message: "Product variant deleted successfully" };
    }
}

module.exports = new ProductVariantService();
