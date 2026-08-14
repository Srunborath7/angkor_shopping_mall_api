const productService = require("../services/productService");
const { Category, Brand, Product, ProductImage } = require("../models/relationships");
const { uploadFile, deleteFile } = require("../utils/uploadToSupabase");
const { successResponse, errorResponse } = require("../utils/response");
const { trackInteraction, trackInteractionBulk } = require("../utils/trackInteraction");
const { getSimilarProducts } = require("../services/recommendationService");

class ProductController {

    async create(req, res) {
        try {
            let image = null;

            if (req.file) {
                image = await uploadFile(req.file, "products");
            }

            let detail = req.body.detail;
            if (typeof detail === "string") {
                try {
                    detail = JSON.parse(detail);
                } catch (e) {
                    detail = undefined;
                }
            }

            let variants = req.body.variants;
            if (typeof variants === "string") {
                try {
                    variants = JSON.parse(variants);
                } catch (e) {
                    variants = undefined;
                }
            }

            let images = req.body.images;
            if (typeof images === "string") {
                try {
                    images = JSON.parse(images);
                } catch (e) {
                    images = undefined;
                }
            }

            const data = {
                name: req.body.name,
                description: req.body.description,
                price: req.body.price,
                stock_quantity: req.body.stock_quantity,
                category_id: req.body.category_id,
                brand_id: req.body.brand_id,
                is_active: req.body.is_active ?? true,
                image_url: image?.url || req.body.image_url,
                image_path: image?.path || req.body.image_path,
                created_by: req.user?.id,
                detail,
                variants,
                images
            };

            const product = await productService.create(data);

            return successResponse(
                res,
                "Product created successfully",
                product,
                201
            );

        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findAll(req, res) {
        try {
            const { category_id, brand_id, search } = req.query;
            const products = await productService.findAll({ category_id, brand_id, search });

            // Track search interaction for authenticated users
            if (search && req.user?.id && products.length > 0) {
                const productIds = products.map((p) => p.id);
                trackInteractionBulk(req.user.id, productIds, 'search');
            }

            return successResponse(
                res,
                "Products fetched successfully",
                {
                    totalItems: products.length,
                    products
                }
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findAllTrue(req, res) {
        try {
            const { category_id, brand_id, search, page = 1, limit = 10 } = req.query;
            const result = await productService.findAllPaged({ category_id, brand_id, search, page, limit });

            // Track search interaction for authenticated users
            if (search && req.user?.id && result.products?.length > 0) {
                const productIds = result.products.map((p) => p.id);
                trackInteractionBulk(req.user.id, productIds, 'search');
            }

            return successResponse(
                res,
                "Products fetched successfully",
                result
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findOne(req, res) {
        try {
            const product = await productService.findOne(req.params.id);

            // Track view interaction for authenticated users (fire-and-forget for AI ML engine)
            if (req.user?.id) {
                trackInteraction(req.user.id, req.params.id, 'view');
            }

            // Fetch Facebook-style AI similar recommendations for this clicked product
            try {
                const aiSimilarProducts = await getSimilarProducts(req.params.id, 6);
                product.ai_similar_products = aiSimilarProducts || [];
            } catch (simErr) {
                console.warn("[productController] Failed to fetch AI similar products:", simErr.message);
                product.ai_similar_products = [];
            }

            return successResponse(
                res,
                "Product fetched successfully",
                product
            );
        } catch (error) {
            return errorResponse(
                res,
                error.message,
                error.message === "Product not found" ? 404 : 400
            );
        }
    }

    async update(req, res) {
        try {
            const product = await Product.findByPk(req.params.id);
            if (!product) {
                return errorResponse(res, "Product not found", 404);
            }

            const data = {
                name: req.body.name ?? product.name,
                description: req.body.description ?? product.description,
                price: req.body.price ?? product.price,
                stock_quantity: req.body.stock_quantity ?? product.stock_quantity,
                category_id: req.body.category_id ?? product.category_id,
                brand_id: req.body.brand_id ?? product.brand_id,
                is_active: req.body.is_active ?? product.is_active,
                updated_by: req.user?.id
            };

            // Update basic product fields first
            const updatedProduct = await productService.update(req.params.id, data);

            // Handle primary image replacement separately, in ProductImage table
            if (req.file) {
                const primaryImage = await ProductImage.findOne({
                    where: { product_id: req.params.id, is_primary: true }
                });

                if (primaryImage && primaryImage.image_path) {
                    try {
                        await deleteFile(primaryImage.image_path);
                    } catch (e) {
                        console.error("Error deleting old image:", e.message);
                    }
                }

                const image = await uploadFile(req.file, "products");

                if (primaryImage) {
                    // reuse the existing primary row
                    await primaryImage.update({
                        image_url: image.url,
                        image_path: image.path
                    });
                } else {
                    // no primary image existed yet — create one
                    await ProductImage.create({
                        product_id: req.params.id,
                        image_url: image.url,
                        image_path: image.path,
                        is_primary: true
                    });
                }
            } else if (req.body.image_url !== undefined || req.body.image_path !== undefined) {
                // allow replacing the primary image by URL instead of file upload
                const primaryImage = await ProductImage.findOne({
                    where: { product_id: req.params.id, is_primary: true }
                });

                if (primaryImage) {
                    await primaryImage.update({
                        image_url: req.body.image_url ?? primaryImage.image_url,
                        image_path: req.body.image_path ?? primaryImage.image_path
                    });
                } else {
                    await ProductImage.create({
                        product_id: req.params.id,
                        image_url: req.body.image_url,
                        image_path: req.body.image_path,
                        is_primary: true
                    });
                }
            }

            // re-fetch so response includes updated images
            const finalProduct = await productService.findOne(req.params.id);

            return successResponse(
                res,
                "Product updated successfully",
                finalProduct
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async delete(req, res) {
        try {
            const product = await Product.findByPk(req.params.id);
            if (!product) {
                return errorResponse(res, "Product not found", 404);
            }

            const galleryImages = await ProductImage.findAll({
                where: { product_id: product.id }
            });

            for (const img of galleryImages) {
                if (img.image_path) {
                    try {
                        await deleteFile(img.image_path);
                    } catch (e) {
                        console.error("Error deleting image file:", e.message);
                    }
                }
            }

            const result = await productService.destroy(req.params.id);
            return successResponse(res, result.message);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
    async seed(req, res) {
        try {
            // Find or create default categories
            const [catElectronics] = await Category.findOrCreate({
                where: { name: 'Electronics' },
                defaults: { note: 'Devices, gadgets, and smart products' }
            });
            const [catFashion] = await Category.findOrCreate({
                where: { name: 'Fashion' },
                defaults: { note: 'Apparel, footwear, and accessories' }
            });
            const [catAppliances] = await Category.findOrCreate({
                where: { name: 'Home Appliances' },
                defaults: { note: 'Kitchen and cleaning appliances' }
            });

            // Find or create default brands
            const [brandApple] = await Brand.findOrCreate({
                where: { name: 'Apple' },
                defaults: { description: 'Premium phones, laptops, and tablets' }
            });
            const [brandSony] = await Brand.findOrCreate({
                where: { name: 'Sony' },
                defaults: { description: 'Industry-leading audio and entertainment electronics' }
            });
            const [brandNike] = await Brand.findOrCreate({
                where: { name: 'Nike' },
                defaults: { description: 'Athletic shoes and apparel' }
            });
            const [brandDyson] = await Brand.findOrCreate({
                where: { name: 'Dyson' },
                defaults: { description: 'Innovative smart vacuums and air care' }
            });

            // Check if products already exist
            const productCount = await Product.count();
            if (productCount > 0) {
                return successResponse(res, 'Database already seeded with products', { count: productCount });
            }

            // Create products
            const mockProducts = [
                {
                    name: 'iPhone 15 Pro Max',
                    description: 'Latest Apple iPhone featuring aerospace-grade titanium design, A17 Pro chip, and a 48MP camera system.',
                    price: 1199.00,
                    stock_quantity: 15,
                    image_url: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&q=80&w=400',
                    category_id: catElectronics.id,
                    brand_id: brandApple.id
                },
                {
                    name: 'MacBook Air M3',
                    description: 'Supercharged by the M3 chip, this ultra-thin laptop delivers high speed and up to 18 hours of battery life.',
                    price: 1099.00,
                    stock_quantity: 10,
                    image_url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&q=80&w=400',
                    category_id: catElectronics.id,
                    brand_id: brandApple.id
                },
                {
                    name: 'Sony WH-1000XM5 Headphones',
                    description: 'Wireless noise-canceling headphones with premium sound, crystal clear calling quality, and smart sensors.',
                    price: 349.99,
                    stock_quantity: 25,
                    image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=400',
                    category_id: catElectronics.id,
                    brand_id: brandSony.id
                },
                {
                    name: 'Sony Bravia 4K Smart TV',
                    description: 'Experience stunning 4K visuals, immersive Dolby Atmos sound, and Google TV integration.',
                    price: 799.99,
                    stock_quantity: 8,
                    image_url: 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&q=80&w=400',
                    category_id: catElectronics.id,
                    brand_id: brandSony.id
                },
                {
                    name: 'Nike Air Max Sneaker',
                    description: 'Comfortable running and lifestyle sneaker featuring iconic Air Max cushioning and breathability.',
                    price: 150.00,
                    stock_quantity: 40,
                    image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=400',
                    category_id: catFashion.id,
                    brand_id: brandNike.id
                },
                {
                    name: 'Dyson V15 Detect Vacuum',
                    description: 'Cordless vacuum cleaner with laser illumination that reveals invisible dust, smart suction optimization.',
                    price: 749.00,
                    stock_quantity: 12,
                    image_url: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&q=80&w=400',
                    category_id: catAppliances.id,
                    brand_id: brandDyson.id
                }
            ];

            const createdProducts = await Product.bulkCreate(mockProducts);

            for (let i = 0; i < createdProducts.length; i++) {
                const prod = createdProducts[i];
                const mock = mockProducts[i];
                if (mock.image_url) {
                    await ProductImage.create({
                        product_id: prod.id,
                        image_url: mock.image_url,
                        is_primary: true
                    });
                }
            }

            return successResponse(res, 'Mock products seeded successfully', {
                categoriesCreated: 3,
                brandsCreated: 4,
                productsCreated: createdProducts.length
            });
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }


    async getBestSellers(req, res) {
        try {
            const limit = Math.min(parseInt(req.query.limit) || 10, 50);
            const products = await productService.getBestSellers(limit);
            return successResponse(res, "Top best-selling products fetched successfully", {
                source: "order_history_best_sellers",
                total: products.length,
                products
            });
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

}

module.exports = new ProductController();
