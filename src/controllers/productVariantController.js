const productVariantService = require("../services/productVariantService");
const { uploadFile, deleteFile } = require("../utils/uploadToSupabase");
const { successResponse, errorResponse } = require("../utils/response");
const { ProductImage } = require("../models/relationships");

class ProductVariantController {
    async create(req, res) {
        try {
            const { productId } = req.params;
            const { sku, price, stock_quantity, attributes } = req.body;

            let image = null;
            if (req.file) {
                image = await uploadFile(req.file, "product_variants");
            }

            let parsedAttributes = attributes;
            if (typeof attributes === "string") {
                try {
                    parsedAttributes = JSON.parse(attributes);
                } catch (e) {
                    parsedAttributes = {};
                }
            }

            const data = {
                sku,
                price: price || null,
                stock_quantity: stock_quantity || 0,
                attributes: parsedAttributes || {},
                image_url: image?.url || req.body.image_url || null,
                image_path: image?.path || req.body.image_path || null
            };

            const variant = await productVariantService.create(productId, data);

            return successResponse(res, "Product variant created successfully", variant, 201);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findAll(req, res) {
        try {
            const { productId } = req.params;
            const variants = await productVariantService.findAll(productId);
            return successResponse(res, "Product variants fetched successfully", variants);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findOne(req, res) {
        try {
            const { id } = req.params;
            const variant = await productVariantService.findOne(id);
            return successResponse(res, "Variant fetched successfully", variant);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const { sku, price, stock_quantity, attributes, is_active } = req.body;

            const currentVariant = await productVariantService.findOne(id);

            const data = {
                sku: sku ?? currentVariant.sku,
                price: price !== undefined ? (price || null) : currentVariant.price,
                stock_quantity: stock_quantity !== undefined ? stock_quantity : currentVariant.stock_quantity,
                is_active: is_active !== undefined ? is_active : currentVariant.is_active
            };

            if (attributes !== undefined) {
                let parsedAttributes = attributes;
                if (typeof attributes === "string") {
                    try {
                        parsedAttributes = JSON.parse(attributes);
                    } catch (e) {
                        parsedAttributes = currentVariant.attributes;
                    }
                }
                data.attributes = parsedAttributes;
            }

            if (req.file) {
                const variantImage = await ProductImage.findOne({
                    where: { product_variant_id: id }
                });
                if (variantImage && variantImage.image_path) {
                    try {
                        await deleteFile(variantImage.image_path);
                    } catch (e) {
                        console.error("Error deleting old image:", e.message);
                    }
                }
                const image = await uploadFile(req.file, "product_variants");
                data.image_url = image.url;
                data.image_path = image.path;
            } else {
                if (req.body.image_url !== undefined) {
                    data.image_url = req.body.image_url;
                }
                if (req.body.image_path !== undefined) {
                    data.image_path = req.body.image_path;
                }
            }

            const variant = await productVariantService.update(id, data);

            return successResponse(res, "Product variant updated successfully", variant);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async updateInventory(req, res) {
        try {
            const { id } = req.params;
            const { stock_quantity } = req.body;

            if (stock_quantity === undefined || isNaN(parseInt(stock_quantity))) {
                return errorResponse(res, "Invalid or missing stock_quantity", 400);
            }

            const variant = await productVariantService.updateInventory(id, parseInt(stock_quantity));
            return successResponse(res, "Inventory updated successfully", variant);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const currentVariant = await productVariantService.findOne(id);

            // Find all gallery images for this variant to delete files from Supabase
            const galleryImages = await ProductImage.findAll({
                where: { product_variant_id: id }
            });

            for (const img of galleryImages) {
                if (img.image_path) {
                    try {
                        await deleteFile(img.image_path);
                    } catch (e) {
                        console.error("Error deleting variant gallery image from Supabase:", e.message);
                    }
                }
            }

            const result = await productVariantService.destroy(id);

            return successResponse(res, result.message);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new ProductVariantController();
