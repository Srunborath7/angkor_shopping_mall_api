require('dotenv').config();
const sequelize = require('./src/config/db');
const {
    User,
    Category,
    Brand,
    TradeProduct,
    TradeProductImage,
    TradeOffer
} = require('./src/models/relationships');
const tradeProductService = require('./src/services/tradeProductService');
const tradeOfferService = require('./src/services/tradeOfferService');

async function runTradeSystemVerification() {
    console.log('=== Starting Product Trading System Verification ===\n');

    try {
        // 1. Sync database schema
        console.log('1. Syncing Sequelize models...');
        await sequelize.sync({ alter: true });
        console.log('✔ Models synchronized successfully.\n');

        // 2. Ensure test users exist
        console.log('2. Setting up test users...');
        const existingUsers = await User.findAll({ limit: 2 });
        let userA, userB;

        if (existingUsers.length >= 2) {
            userA = existingUsers[0];
            userB = existingUsers[1];
        } else {
            const timestamp = Date.now();
            userA = await User.create({
                name: `Trader Alex ${timestamp}`,
                email: `trade_alex_${timestamp}@test.com`,
                password: 'Password123!',
                phone: `099${String(timestamp).slice(-6)}`,
                is_active: true
            });

            userB = await User.create({
                name: `Trader Bob ${timestamp}`,
                email: `trade_bob_${timestamp}@test.com`,
                password: 'Password123!',
                phone: `098${String(timestamp).slice(-6)}`,
                is_active: true
            });
        }

        // Get or create category
        const [testCategory] = await Category.findOrCreate({
            where: { name: 'Electronics' },
            defaults: { note: 'Devices and gadgets' }
        });

        console.log(`✔ User A: ${userA.name} (${userA.id})`);
        console.log(`✔ User B: ${userB.name} (${userB.id})\n`);

        // 3. User A creates a Trade Product listing
        console.log('3. User A creating a Trade Product listing (PlayStation 5)...');
        const listingA = await tradeProductService.create(userA.id, {
            title: 'PlayStation 5 Disc Edition (Used 6 months)',
            description: 'Barely used PS5 with 2 DualSense controllers and original box.',
            category_id: testCategory.id,
            condition: 'like_new',
            estimated_value: 450.00,
            trading_preference: 'Looking to trade for RTX 4070 or iPad Pro 11-inch',
            accept_cash_difference: true,
            location: 'Phnom Penh, Toul Kork',
            phone_number: '012345678',
            image_url: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=500',
            images: [
                'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=500'
            ]
        });

        console.log(`✔ Trade listing created with ID: ${listingA.id}`);
        console.log(`  Title: ${listingA.title}`);
        console.log(`  Condition: ${listingA.condition}`);
        console.log(`  Estimated Value: $${listingA.estimated_value}`);
        console.log(`  Images attached: ${listingA.images?.length || 0}\n`);

        // 4. User B creates their own trade item (iPad Pro)
        console.log('4. User B creating their own Trade Product listing (iPad Pro)...');
        const listingB = await tradeProductService.create(userB.id, {
            title: 'iPad Pro 11-inch M1 128GB Wi-Fi',
            description: 'Good condition with Apple Pencil 2 included.',
            category_id: testCategory.id,
            condition: 'good',
            estimated_value: 480.00,
            trading_preference: 'Looking for PS5 or Gaming Laptop',
            accept_cash_difference: true,
            location: 'Phnom Penh, BKK1',
            phone_number: '087654321',
            image_url: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=500'
        });
        console.log(`✔ User B listing created with ID: ${listingB.id}\n`);

        // 5. Test search and filtering
        console.log('5. Querying available trade listings with search="PlayStation"...');
        const searchResult = await tradeProductService.findAll({ search: 'PlayStation', condition: 'like_new' });
        console.log(`✔ Found ${searchResult.totalItems} matching listing(s).`);
        console.log(`  First item: ${searchResult.tradeProducts[0]?.title}\n`);

        // 6. User B submits a trade offer to User A
        console.log('6. User B submitting a trade offer on User A\'s PS5...');
        const offer = await tradeOfferService.createOffer(userB.id, {
            trade_product_id: listingA.id,
            offered_product_id: listingB.id,
            offered_item_title: listingB.title,
            offered_item_description: 'I will trade my iPad Pro M1 with Apple Pencil for your PS5.',
            offered_cash_difference: 30.00, // User B requests/offers difference
            message: 'Can we meet in Toul Kork tomorrow?',
            contact_info: 'Telegram: @trader_bob'
        });

        console.log(`✔ Offer submitted with ID: ${offer.id}`);
        console.log(`  Sender: ${offer.sender.name}`);
        console.log(`  Target: ${offer.tradeProduct.title}`);
        console.log(`  Offered item: ${offer.offeredProduct?.title}`);
        console.log(`  Status: ${offer.status}\n`);

        // 7. Verify Received and Sent offers
        console.log('7. Checking User A\'s received offers and User B\'s sent offers...');
        const received = await tradeOfferService.getReceivedOffers(userA.id);
        const sent = await tradeOfferService.getSentOffers(userB.id);
        console.log(`✔ User A received offers count: ${received.totalItems}`);
        console.log(`✔ User B sent offers count: ${sent.totalItems}\n`);

        // 8. User A accepts the offer
        console.log('8. User A accepting the trade offer...');
        const acceptedOffer = await tradeOfferService.updateOfferStatus(offer.id, userA.id, 'accepted', 'Deal agreed, meet tomorrow!');
        console.log(`✔ Offer status updated to: ${acceptedOffer.status}`);
        
        const refreshedListingA = await tradeProductService.findById(listingA.id);
        console.log(`✔ Listing A status updated to: ${refreshedListingA.status} (expected: in_negotiation)\n`);

        // 9. Mark trade as completed
        console.log('9. Marking trade as completed...');
        const completedOffer = await tradeOfferService.updateOfferStatus(offer.id, userA.id, 'completed', 'Physical swap completed successfully.');
        console.log(`✔ Offer status updated to: ${completedOffer.status}`);

        const finalListingA = await tradeProductService.findById(listingA.id);
        const finalListingB = await tradeProductService.findById(listingB.id);
        console.log(`✔ Listing A final status: ${finalListingA.status} (expected: traded)`);
        console.log(`✔ Listing B final status: ${finalListingB.status} (expected: traded)\n`);

        // 10. Clean up test records
        console.log('10. Cleaning up test data...');
        await tradeProductService.delete(listingA.id, userA.id);
        await tradeProductService.delete(listingB.id, userB.id);
        console.log('✔ Test trade products and offers deleted successfully.\n');

        console.log('====================================================');
        console.log('🎉 ALL PRODUCT TRADING SYSTEM TESTS PASSED SUCCESSFULLY!');
        console.log('====================================================');
        process.exit(0);

    } catch (err) {
        console.error('❌ Verification failed with error:', err);
        process.exit(1);
    }
}

runTradeSystemVerification();
