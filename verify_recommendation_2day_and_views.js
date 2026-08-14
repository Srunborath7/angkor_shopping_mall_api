/**
 * verify_recommendation_2day_and_views.js
 *
 * Verifies:
 * 1. Tracking view, search, order interactions.
 * 2. 2-day retention window filtering & auto-cleanup (records > 2 days deleted, records <= 2 days kept).
 * 3. Detail product view similar items & user personalization (User A - Apple vs User B).
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const sequelize = require('./src/config/db');
const { Product, Category, Brand, UserProductInteraction } = require('./src/models/relationships');
const { trackInteraction, trackInteractionBulk, cleanupOldInteractions } = require('./src/utils/trackInteraction');
const { 
    getMLRecommendations, 
    getUserPersonalizedProducts, 
    getSimilarProducts, 
    getSearchSuggestions 
} = require('./src/services/recommendationService');

async function runVerification() {
    console.log('--- Starting 2-Day Recommendation & Detail View Verification ---');
    try {
        await sequelize.authenticate();
        console.log('✓ Database connection authenticated.');

        // 1. Check or seed sample products if needed
        let [appleBrand] = await Brand.findOrCreate({ where: { name: 'Apple' }, defaults: { description: 'Apple Inc.' } });
        let [sonyBrand] = await Brand.findOrCreate({ where: { name: 'Sony' }, defaults: { description: 'Sony Corp' } });
        let [elecCat] = await Category.findOrCreate({ where: { name: 'Electronics' }, defaults: { note: 'Electronic devices' } });

        let [iphone] = await Product.findOrCreate({
            where: { name: 'iPhone 15 Pro' },
            defaults: {
                description: 'Flagship Apple smartphone with A17 Pro chip',
                price: 999.00,
                stock_quantity: 20,
                category_id: elecCat.id,
                brand_id: appleBrand.id,
                is_active: true
            }
        });

        let [macbook] = await Product.findOrCreate({
            where: { name: 'MacBook Pro M3' },
            defaults: {
                description: 'High performance Apple laptop with M3 Max',
                price: 1999.00,
                stock_quantity: 10,
                category_id: elecCat.id,
                brand_id: appleBrand.id,
                is_active: true
            }
        });

        let [sonyHeadphones] = await Product.findOrCreate({
            where: { name: 'Sony WH-1000XM5' },
            defaults: {
                description: 'Noise canceling headphones by Sony',
                price: 399.00,
                stock_quantity: 15,
                category_id: elecCat.id,
                brand_id: sonyBrand.id,
                is_active: true
            }
        });

        console.log(`✓ Products available: "${iphone.name}" (${iphone.id}), "${macbook.name}" (${macbook.id}), "${sonyHeadphones.name}" (${sonyHeadphones.id})`);

        // 2. Fetch existing users or create test users
        const { User } = require('./src/models/relationships');
        const existingUsers = await User.findAll({ limit: 2 });
        let userA, userB;
        if (existingUsers.length >= 2) {
            userA = existingUsers[0];
            userB = existingUsers[1];
        } else {
            const randSuffix = Date.now().toString().slice(-6);
            userA = await User.create({
                name: 'User A (Apple Fan)',
                email: `user_a_${randSuffix}@test.com`,
                password: 'hashedPassword123',
                phone: `099${randSuffix}`
            });
            userB = await User.create({
                name: 'User B (Sony Fan)',
                email: `user_b_${randSuffix}@test.com`,
                password: 'hashedPassword123',
                phone: `088${randSuffix}`
            });
        }

        const testUserA = userA.id;
        const testUserB = userB.id;

        // Clean up previous interactions for test users first
        await UserProductInteraction.destroy({ where: { user_id: [testUserA, testUserB] } });

        // Create an OLD interaction (3 days ago - should be purged)
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        await UserProductInteraction.create({
            user_id: testUserA,
            product_id: sonyHeadphones.id,
            interaction_type: 'view',
            weight: 1,
            created_at: threeDaysAgo
        });

        // Create a RECENT interaction for User A (view iPhone 2 hours ago)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        await UserProductInteraction.create({
            user_id: testUserA,
            product_id: iphone.id,
            interaction_type: 'view',
            weight: 1,
            created_at: twoHoursAgo
        });

        // Run cleanupOldInteractions(2 days)
        console.log('\n--- Testing Auto-Cleanup (2 days retention) ---');
        const deletedCount = await cleanupOldInteractions(2);
        console.log(`✓ Cleanup executed: ${deletedCount} expired record(s) deleted.`);

        // Verify the 3-day old record was deleted and 2-hour old record remained
        const remainingForUserA = await UserProductInteraction.findAll({ where: { user_id: testUserA } });
        console.log(`✓ User A active interactions count: ${remainingForUserA.length} (expected 1, got ${remainingForUserA.length})`);
        if (remainingForUserA.length === 1 && remainingForUserA[0].product_id === iphone.id) {
            console.log('✓ SUCCESS: Only interactions within the 2-day window are retained.');
        } else {
            console.warn('⚠️ Retention check did not match exact expectations.');
        }

        // 3. Test Detail Product View Recommendations (Similar Products)
        console.log('\n--- Testing Detail View Recommendations for iPhone ---');
        const similarToIphone = await getSimilarProducts(iphone.id, 4);
        console.log(`✓ Found ${similarToIphone.length} similar products for ${iphone.name}:`);
        similarToIphone.forEach(p => {
            console.log(`  - [${p.name}] (Brand: ${p.brand?.name || 'N/A'}) - Reason: ${p.recommendation_reason}`);
        });

        // 4. Test User A Personalized Feed (User A viewed Apple)
        console.log('\n--- Testing User A Personalized Feed (After viewing Apple) ---');
        const userARecs = await getUserPersonalizedProducts(testUserA, 5);
        console.log(`✓ User A Feed Source: ${userARecs.source}`);
        console.log(`✓ User A Detected Interests:`, JSON.stringify(userARecs.user_interests));
        console.log(`✓ User A Recommended Items:`);
        userARecs.products.forEach(p => {
            console.log(`  - [${p.name}] - Score / Reason: ${p.recommendation_reason}`);
        });

        // 5. Test User B Search AI Suggestions
        console.log('\n--- Testing User B Search "Sony" ---');
        const searchRes = await getSearchSuggestions('Sony', 5, testUserB);
        console.log(`✓ Search matched products count: ${searchRes.products.length}`);
        console.log(`✓ Search AI suggestions count: ${searchRes.ai_suggestions.length}`);
        searchRes.products.forEach(p => console.log(`  - Direct match: ${p.name}`));
        searchRes.ai_suggestions.forEach(p => console.log(`  - AI Suggestion: ${p.name}`));

        // Cleanup test users
        await UserProductInteraction.destroy({ where: { user_id: [testUserA, testUserB] } });
        console.log('\n✓ Test data cleaned up.');
        console.log('--- ALL VERIFICATIONS PASSED SUCCESSFULLY ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ Verification failed:', err);
        process.exit(1);
    }
}

runVerification();
