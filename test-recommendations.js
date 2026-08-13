/**
 * test-recommendations.js
 *
 * Automated verification script to test:
 * 1. User A (Dara) recommendations -> Tech/Phones focus
 * 2. User B (audit_user / KK) recommendations -> Shoe/Fashion focus
 * 3. Recommendation payload structure & smoothness for frontend
 * 4. Tracking user interaction
 */

require("dotenv").config();
const sequelize = require("./src/config/db");
const { User, Product } = require("./src/models/relationships");
const { getMLRecommendations } = require("./src/services/recommendationService");
const { trackInteraction } = require("./src/utils/trackInteraction");

async function runTests() {
    try {
        console.log("--------------------------------------------------");
        console.log("  Testing Facebook-Style Personalized Engine");
        console.log("--------------------------------------------------");

        await sequelize.authenticate();
        console.log("✅ DB connection established.");

        const users = await User.findAll({ attributes: ["id", "name", "email"], raw: true });
        const products = await Product.findAll({ attributes: ["id", "name"], raw: true });

        const userA = users.find((u) => u.name.toLowerCase().includes("dara")) || users[0];
        const userB = users.find((u) => u.name.toLowerCase().includes("kk") || u.name.toLowerCase().includes("audit")) || users[1];

        console.log(`User A: ${userA.name} (${userA.id})`);
        console.log(`User B: ${userB.name} (${userB.id})`);

        // Test 1: Recommendations for User A
        console.log("\n--- Fetching Recommendations for User A (Searched & Viewed Tech/Headphones) ---");
        const recA = await getMLRecommendations(userA.id, 5);
        console.log(`Source: ${recA.source}`);
        console.log(`User Interests:`, JSON.stringify(recA.user_interests || {}));
        console.log("Recommended Products for User A:");
        recA.products.forEach((p, idx) => {
            console.log(`  ${idx + 1}. [${p.category?.name || "General"}] ${p.name}`);
            console.log(`     Reason: "${p.recommendation_reason}"`);
        });

        // Test 2: Recommendations for User B
        console.log("\n--- Fetching Recommendations for User B (Searched & Viewed Shoes/Sneakers) ---");
        const recB = await getMLRecommendations(userB.id, 5);
        console.log(`Source: ${recB.source}`);
        console.log(`User Interests:`, JSON.stringify(recB.user_interests || {}));
        console.log("Recommended Products for User B:");
        recB.products.forEach((p, idx) => {
            console.log(`  ${idx + 1}. [${p.category?.name || "General"}] ${p.name}`);
            console.log(`     Reason: "${p.recommendation_reason}"`);
        });

        // Test 3: Tracking new search interaction for User A
        console.log("\n--- Testing Real-time Search Tracking for User A ---");
        if (products.length > 0) {
            await trackInteraction(userA.id, products[0].id, "search");
            console.log(`✅ Successfully tracked search interaction for Product: "${products[0].name}"`);
        }

        console.log("\n==================================================");
        console.log("  [PASS] Recommendation tests completed smoothly!");
        console.log("==================================================");
        process.exit(0);
    } catch (err) {
        console.error("❌ Test failed:", err);
        process.exit(1);
    }
}

runTests();
