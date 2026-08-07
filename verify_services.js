require('dotenv').config();
const sequelize = require('./src/config/db');
const productService = require('./src/services/productService');
const { Category, Brand, ProductImage } = require('./src/models/relationships');

async function testServices() {
    try {
        console.log("1. Connecting to Database...");
        await sequelize.authenticate();

        console.log("\n2. Syncing tables...");
        await sequelize.sync({ alter: true });

        console.log("\n3. Finding or creating Brand & Category...");
        const [category] = await Category.findOrCreate({
            where: { name: 'Electronics Image Sync Test' },
            defaults: { note: 'Sync image test' }
        });
        const [brand] = await Brand.findOrCreate({
            where: { name: 'Apple Image Sync Test' },
            defaults: { description: 'Sync image test' }
        });

        console.log("\n4. Calling productService.create with main product image...");
        const product = await productService.create({
            name: 'Image Synced iPhone 2026',
            description: 'Test main image synchronization with ProductImage gallery.',
            price: 1399.99,
            stock_quantity: 100,
            category_id: category.id,
            brand_id: brand.id,
            is_active: true,
            image_url: 'https://example.com/main-iphone-image.jpg',
            image_path: 'products/main-iphone-image.jpg',
            images: [
                { image_url: 'https://example.com/gallery-iphone-side.jpg', is_primary: false }
            ]
        });

        console.log("Product created with ID:", product.id);

        console.log("\n5. Querying ProductImage gallery for this product...");
        const galleryImages = await ProductImage.findAll({
            where: { product_id: product.id }
        });

        console.log(`- Found ${galleryImages.length} images in the gallery:`);
        for (const img of galleryImages) {
            console.log(`  * URL: ${img.image_url} (Is Primary: ${img.is_primary})`);
        }

        const primaryImageCount = galleryImages.filter(img => img.is_primary).length;
        if (primaryImageCount !== 1) {
            throw new Error(`Expected exactly 1 primary image in the gallery, but found ${primaryImageCount}`);
        }

        console.log("\n6. Testing update method sync...");
        await productService.update(product.id, {
            image_url: 'https://example.com/updated-main-iphone.jpg',
            image_path: 'products/updated-main-iphone.jpg'
        });

        const updatedGallery = await ProductImage.findAll({
            where: { product_id: product.id }
        });

        console.log(`- Found ${updatedGallery.length} images in the gallery after update:`);
        for (const img of updatedGallery) {
            console.log(`  * URL: ${img.image_url} (Is Primary: ${img.is_primary})`);
        }

        const primaryImg = updatedGallery.find(img => img.is_primary);
        if (primaryImg.image_url !== 'https://example.com/updated-main-iphone.jpg') {
            throw new Error(`Primary image url in gallery was not updated. Found 1: ${primaryImg.image_url}`);
        }

        console.log("\n7. Cleaning up created mock records...");
        await productService.destroy(product.id);
        console.log("Cleanup complete.");

        console.log("\nIMAGE SYNCHRONIZATION VERIFICATION PASSED SUCCESSFULLY!");
        process.exit(0);
    } catch (error) {
        console.error("Test failed with error:", error);
        process.exit(1);
    }
}

testServices();
