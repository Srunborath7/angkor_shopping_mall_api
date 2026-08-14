require('dotenv').config();
const sequelize = require('./src/config/db');
const {
    User,
    Category,
    Brand,
    Product,
    CartItem,
    Order,
    OrderItem,
    TradeProduct,
    TradeProductImage,
    TradeOffer
} = require('./src/models/relationships');
const tradeProductService = require('./src/services/tradeProductService');
const orderController = require('./src/controllers/orderController');

async function runOrderTradeIntegrationVerification() {
    console.log('=== Starting Order & Trade Integration Verification ===\n');

    try {
        // 1. Sync database schema
        console.log('1. Syncing Sequelize models with new schema fields...');
        await sequelize.sync({ alter: true });
        console.log('✔ Models synchronized successfully.\n');

        // 2. Create test user and store products
        console.log('2. Setting up test user & store products...');
        const timestamp = Date.now();
        const testUser = await User.create({
            name: `Order Trader ${timestamp}`,
            email: `ordertrade_${timestamp}@test.com`,
            password: 'Password123!',
            phone: `097${String(timestamp).slice(-6)}`,
            is_active: true
        });

        const [testCategory] = await Category.findOrCreate({
            where: { name: 'Electronics' },
            defaults: { note: 'Devices and gadgets' }
        });

        const [testBrand] = await Brand.findOrCreate({
            where: { name: 'Apple' },
            defaults: { note: 'Apple Inc.' }
        });

        // Create store product 1 (Original purchase)
        const product1 = await Product.create({
            name: `iPhone 13 128GB ${timestamp}`,
            description: 'Original Apple iPhone 13 purchased from Angkor Mall',
            price: 600.00,
            stock_quantity: 10,
            category_id: testCategory.id,
            brand_id: testBrand.id,
            is_active: true
        });

        // Create store product 2 (Item to buy later with Trade-In)
        const product2 = await Product.create({
            name: `iPhone 15 Pro 256GB ${timestamp}`,
            description: 'Next gen iPhone',
            price: 1000.00,
            stock_quantity: 10,
            category_id: testCategory.id,
            brand_id: testBrand.id,
            is_active: true
        });

        console.log(`✔ Test User created: ${testUser.name} (${testUser.id})`);
        console.log(`✔ Store Product 1: ${product1.name} ($${product1.price})`);
        console.log(`✔ Store Product 2: ${product2.name} ($${product2.price})\n`);

        // 3. User buys Product 1 (Order #1)
        console.log('3. Simulating user purchasing Product 1 (Order #1)...');
        const order1 = await Order.create({
            user_id: testUser.id,
            subtotal_amount: 600.00,
            trade_in_discount: 0.00,
            total_amount: 600.00,
            status: 'completed', // Completed order
            shipping_address: '123 Norodom Blvd, Phnom Penh',
            contact_phone: testUser.phone
        });

        const orderItem1 = await OrderItem.create({
            order_id: order1.id,
            product_id: product1.id,
            quantity: 1,
            price: 600.00,
            attributes: { color: 'Midnight Blue' }
        });
        console.log(`✔ Order #1 created (${order1.id}), Item: ${orderItem1.id}\n`);

        // 4. Test getEligibleOrderedItems
        console.log('4. Testing getEligibleOrderedItems endpoint service...');
        const eligibleItems = await tradeProductService.getEligibleOrderedItems(testUser.id);
        console.log(`✔ Eligible items count: ${eligibleItems.length}`);
        const found = eligibleItems.find(i => i.order_item_id === orderItem1.id);
        if (!found) {
            throw new Error('Purchased order item not found in eligible list!');
        }
        console.log(`  Found Item: "${found.product_name}"`);
        console.log(`  Purchase Price: $${found.purchase_price}`);
        console.log(`  Already Listed?: ${found.is_already_listed}\n`);

        // 5. User creates a Trade Listing directly from this purchased item
        console.log('5. User listing their purchased item for trade (with order_item_id)...');
        const tradeListing = await tradeProductService.create(testUser.id, {
            order_item_id: orderItem1.id,
            condition: 'good',
            estimated_value: 400.00, // Used value
            trading_preference: 'Want to trade towards iPhone 15 Pro or sell',
            location: 'Phnom Penh'
        });

        console.log(`✔ Trade listing created with ID: ${tradeListing.id}`);
        console.log(`  Title: ${tradeListing.title}`);
        console.log(`  Condition: ${tradeListing.condition}`);
        console.log(`  Estimated Value: $${tradeListing.estimated_value}`);
        console.log(`  Store Verified?: ${tradeListing.is_store_verified}`);
        console.log(`  Source Order ID: ${tradeListing.order_id}`);
        console.log(`  Original Product ID: ${tradeListing.original_product_id}\n`);

        if (!tradeListing.is_store_verified) {
            throw new Error('Expected is_store_verified to be true!');
        }

        // 6. Verify that getEligibleOrderedItems now shows item as already listed
        console.log('6. Checking that eligible items reflects is_already_listed = true...');
        const eligibleAfter = await tradeProductService.getEligibleOrderedItems(testUser.id);
        const itemAfter = eligibleAfter.find(i => i.order_item_id === orderItem1.id);
        console.log(`✔ is_already_listed: ${itemAfter.is_already_listed}`);
        if (!itemAfter.is_already_listed) {
            throw new Error('Item should be marked as already listed!');
        }
        console.log('');

        // 7. Test Trade-In checkout (User buys Product 2 ($1000) with Trade-In of tradeListing ($400))
        console.log('7. Testing Trade-In Checkout for Product 2...');
        // Put Product 2 in cart
        await CartItem.create({
            user_id: testUser.id,
            product_id: product2.id,
            quantity: 1
        });

        // Mock req and res for OrderController.checkout
        let checkoutResponseData = null;
        let checkoutStatusCode = null;

        const reqMock = {
            user: { id: testUser.id },
            body: {
                shipping_address: '456 Monivong Blvd, Phnom Penh',
                contact_phone: testUser.phone,
                trade_in_product_id: tradeListing.id
            },
            protocol: 'http',
            get: () => 'localhost:3000'
        };

        const resMock = {
            status: function(code) {
                checkoutStatusCode = code;
                return this;
            },
            json: function(payload) {
                checkoutResponseData = payload;
                return this;
            }
        };

        await orderController.checkout(reqMock, resMock);

        if (!checkoutResponseData || !checkoutResponseData.success) {
            throw new Error(`Checkout failed: ${checkoutResponseData?.message}`);
        }

        const newOrder = checkoutResponseData.data.order;
        console.log(`✔ Order #2 placed with Trade-In:`);
        console.log(`  Subtotal Amount: $${newOrder.subtotal_amount}`);
        console.log(`  Trade-In Discount: $${newOrder.trade_in_discount}`);
        console.log(`  Final Total Amount: $${newOrder.total_amount}`);
        console.log(`  Trade-In Product ID: ${newOrder.trade_in_product_id}\n`);

        if (parseFloat(newOrder.subtotal_amount) !== 1000.00) {
            throw new Error(`Expected subtotal $1000, got ${newOrder.subtotal_amount}`);
        }
        if (parseFloat(newOrder.trade_in_discount) !== 400.00) {
            throw new Error(`Expected discount $400, got ${newOrder.trade_in_discount}`);
        }
        if (parseFloat(newOrder.total_amount) !== 600.00) {
            throw new Error(`Expected total $600, got ${newOrder.total_amount}`);
        }

        // 8. Verify trade listing status is in_negotiation
        const tradeListingAfterCheckout = await TradeProduct.findByPk(tradeListing.id);
        console.log(`✔ Trade product status during pending order: ${tradeListingAfterCheckout.status} (expected: in_negotiation)`);
        if (tradeListingAfterCheckout.status !== 'in_negotiation') {
            throw new Error(`Expected in_negotiation, got ${tradeListingAfterCheckout.status}`);
        }

        // 9. Simulate payment completion
        console.log('\n8. Simulating payment completion on Order #2...');
        const payReqMock = {
            params: { id: newOrder.id },
            body: { payment_intent: 'pi_test_tradein_123' }
        };
        let payResponseData = null;
        const payResMock = {
            status: function(code) { return this; },
            json: function(payload) { payResponseData = payload; return this; }
        };

        await orderController.payOrder(payReqMock, payResMock);

        const tradeListingAfterPaid = await TradeProduct.findByPk(tradeListing.id);
        console.log(`✔ Trade product status after order paid: ${tradeListingAfterPaid.status} (expected: traded)\n`);
        if (tradeListingAfterPaid.status !== 'traded') {
            throw new Error(`Expected traded, got ${tradeListingAfterPaid.status}`);
        }

        // 10. Clean up test records
        console.log('9. Cleaning up test data...');
        await OrderItem.destroy({ where: { order_id: [order1.id, newOrder.id] } });
        await Order.destroy({ where: { id: [order1.id, newOrder.id] } });
        await tradeProductService.delete(tradeListing.id, testUser.id, true);
        await Product.destroy({ where: { id: [product1.id, product2.id] } });
        await User.destroy({ where: { id: testUser.id } });
        console.log('✔ Cleanup finished successfully.\n');

        console.log('=====================================================================');
        console.log('🎉 ALL ORDER & TRADE INTEGRATION TESTS PASSED SUCCESSFULLY!');
        console.log('=====================================================================');
        process.exit(0);

    } catch (err) {
        console.error('❌ Verification failed with error:', err);
        process.exit(1);
    }
}

runOrderTradeIntegrationVerification();
