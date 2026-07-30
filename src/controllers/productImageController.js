const productImageService = require("../services/productImageService");
const { uploadFile, deleteFile } = require("../utils/uploadToSupabase");
const { successResponse, errorResponse } = require("../utils/response");

class ProductImageController {
    async upload(req, res) {
        try {
            const { productId } = req.params;
            const { product_variant_id, is_primary } = req.body;

            let image_url = req.body.image_url;
            let image_path = req.body.image_path;

            if (req.file) {
                const image = await uploadFile(req.file, "product_gallery");
                image_url = image.url;
                image_path = image.path;
            }

            if (!image_url) {
                return errorResponse(res, "No image file or URL provided", 400);
            }

            const productImage = await productImageService.upload(productId, {
                product_variant_id,
                image_url,
                image_path,
                is_primary
            });

            return successResponse(res, "Product image uploaded successfully", productImage, 201);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findAll(req, res) {
        try {
            const { productId } = req.params;
            const images = await productImageService.findAll(productId);
            return successResponse(res, "Product images retrieved successfully", images);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const image = await productImageService.destroy(id);

            if (image.image_path) {
                try {
                    await deleteFile(image.image_path);
                } catch (e) {
                    console.error("Error deleting image file from Supabase:", e.message);
                }
            }

            await image.destroy();

            return successResponse(res, "Product image deleted successfully");
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new ProductImageController();
