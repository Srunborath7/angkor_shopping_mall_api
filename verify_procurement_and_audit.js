require('dotenv').config();
const sequelize = require('./src/config/db');
const {
    User,
    Category,
    Brand,
    Product,
    Supplier,
    PurchaseOrder,
    PurchaseOrderItem
} = require('./src/models/relationships');

const supplierService = require('./src/services/supplierService');
const purchaseOrderService = require('./src/services/purchaseOrderService');
const productService = require('./src/services/productService');
const categoryService = require('./src/services/categoryService');
const brandService = require('./src/services/brandService');

async function testProcurementAndAudit() {
    try {
        console.log("1. Authenticating DB and syncing schema...");
        await sequelize.authenticate();
        await sequelize.sync({ alter: true });
        console.log("   DB synced successfully.");

        console.log("\n2. Creating a test User for audit trailing...");
        const [user] = await User.findOrCreate({
            where: { email: 'audit_test@example.com' },
            defaults: {
                name: 'audit_user',
                phone: '+85599887766',
                password: 'hashedpassword123',
                is_active: true
            }
        });
        console.log(`   User created/found with ID: ${user.id}`);

        console.log("\n3. Testing Category creation with created_by audit field...");
        const category = await categoryService.createCategory({
            name: `Test Category ${Date.now()}`,
            note: 'Testing audit tracking',
            created_by: user.id
        });
        console.log(`   Category created: ${category.name}, created_by: ${category.created_by}`);

        console.log("\n4. Testing Category update with updated_by audit field...");
        const updatedCategory = await categoryService.updateCategory(category.id, {
            note: 'Updated audit note',
            updated_by: user.id
        });
        console.log(`   Category updated with updater: ${updatedCategory.updater ? updatedCategory.updater.name : 'N/A'}`);

        console.log("\n5. Testing Brand creation with created_by...");
        const brand = await brandService.createBrand({
            name: `Test Brand ${Date.now()}`,
            description: 'Audit test brand',
            created_by: user.id
        });
        console.log(`   Brand created: ${brand.name}, created_by: ${brand.created_by}`);

        console.log("\n6. Creating a Product with initial stock 50...");
        const product = await productService.create({
            name: `Procurement Product ${Date.now()}`,
            description: 'Product for purchase order test',
            price: 299.99,
            stock_quantity: 50,
            category_id: category.id,
            brand_id: brand.id,
            created_by: user.id
        });
        console.log(`   Product created with ID: ${product.id}, Initial stock: ${product.stock_quantity}`);

        console.log("\n7. Creating a Supplier (Vendor)...");
        const supplier = await supplierService.createSupplier({
            name: `Tech Supplier ${Date.now()}`,
            contact_person: 'John Vendor',
            email: 'john@techsupplier.com',
            phone: '+85512345678',
            address: 'Phnom Penh, Cambodia',
            created_by: user.id
        });
        console.log(`   Supplier created: ${supplier.name} (ID: ${supplier.id})`);

        console.log("\n8. Creating a Purchase Order (Status: pending) to buy 20 units of the product...");
        const po = await purchaseOrderService.createPurchaseOrder({
            supplier_id: supplier.id,
            notes: 'Restocking inventory for ecommerce sale',
            created_by: user.id,
            status: 'pending',
            items: [
                {
                    product_id: product.id,
                    quantity: 20,
                    unit_cost: 200.00
                }
            ]
        });
        console.log(`   PO Created: ${po.po_number}, Total Amount: $${po.total_amount}, Status: ${po.status}`);

        console.log("\n9. Verifying product stock BEFORE receiving PO...");
        let pCheck = await Product.findByPk(product.id);
        console.log(`   Product stock before PO receive: ${pCheck.stock_quantity}`);

        console.log("\n10. Updating Purchase Order status to 'received'...");
        const receivedPo = await purchaseOrderService.updateStatus(po.id, 'received', user.id);
        console.log(`    PO Status updated to: ${receivedPo.status}`);

        console.log("\n11. Verifying product stock AFTER receiving PO (should increase by 20 -> 50 + 20 = 70)...");
        pCheck = await Product.findByPk(product.id);
        console.log(`    Product stock after PO receive: ${pCheck.stock_quantity}`);

        if (pCheck.stock_quantity !== 70) {
            throw new Error(`Stock mismatch! Expected 70, but got ${pCheck.stock_quantity}`);
        }

        console.log("\n12. Cleaning up test records...");
        await purchaseOrderService.updateStatus(po.id, 'cancelled', user.id);
        await purchaseOrderService.deletePurchaseOrder(po.id);
        await productService.destroy(product.id);
        await brandService.deleteBrand(brand.id);
        await categoryService.deleteCategory(category.id);
        await supplierService.deleteSupplier(supplier.id);
        console.log("    Cleanup complete.");

        console.log("\nPROCUREMENT AND AUDIT SYSTEM VERIFICATION PASSED SUCCESSFULLY!");
        process.exit(0);
    } catch (error) {
        console.error("\nVerification failed with error:", error);
        process.exit(1);
    }
}

testProcurementAndAudit();
