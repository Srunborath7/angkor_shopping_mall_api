/**
 * seed-interactions.js
 *
 * Seeds realistic user–product interaction data so the ML model
 * has enough records to train on.
 *
 * Run:  node seed-interactions.js
 */

require("dotenv").config();
const sequelize             = require("./src/config/db");
const UserProductInteraction = require("./src/models/userProductInteractionModel");
const Product               = require("./src/models/productModel");
const User                  = require("./src/models/userModel");

// Interaction weights
const WEIGHTS = { view: 1, search: 2, cart: 3, order: 5 };

async function main() {
    await sequelize.authenticate();
    console.log("✅ DB connected");

    // Load all users and products
    const users    = await User.findAll({ attributes: ["id"], raw: true });
    const products = await Product.findAll({ where: { is_active: true }, attributes: ["id"], raw: true });

    if (users.length === 0) {
        console.error("❌ No users found. Register at least one user first via POST /api/auth/register");
        process.exit(1);
    }
    if (products.length === 0) {
        console.error("❌ No products found. Run: node test-seed.js  OR  POST /api/products/seed");
        process.exit(1);
    }

    console.log(`Found ${users.length} users and ${products.length} products.`);

    // Clear previous seed interactions (optional — comment out to keep real data)
    await UserProductInteraction.destroy({ where: {} });
    console.log("🗑  Cleared previous interactions.");

    const records = [];

    // Simulate realistic behaviour: each user interacts with a random subset of products
    for (const user of users) {
        // Pick a random subset of products this user "likes"
        const shuffled    = [...products].sort(() => Math.random() - 0.5);
        const likedCount  = Math.max(3, Math.floor(products.length * 0.5));
        const liked       = shuffled.slice(0, likedCount);

        for (const product of liked) {
            const rand = Math.random();

            // Always add a view
            records.push({
                user_id:          user.id,
                product_id:       product.id,
                interaction_type: "view",
                weight:           WEIGHTS.view,
            });

            // 70% chance of search interaction
            if (rand > 0.3) {
                records.push({
                    user_id:          user.id,
                    product_id:       product.id,
                    interaction_type: "search",
                    weight:           WEIGHTS.search,
                });
            }

            // 40% chance of cart
            if (rand > 0.6) {
                records.push({
                    user_id:          user.id,
                    product_id:       product.id,
                    interaction_type: "cart",
                    weight:           WEIGHTS.cart,
                });
            }

            // 25% chance of order (strongest signal)
            if (rand > 0.75) {
                records.push({
                    user_id:          user.id,
                    product_id:       product.id,
                    interaction_type: "order",
                    weight:           WEIGHTS.order,
                });
            }
        }
    }

    await UserProductInteraction.bulkCreate(records);
    console.log(`✅ Seeded ${records.length} interaction records.`);
    console.log("   Now run:  cd src/ml && python train.py");
    process.exit(0);
}

main().catch((err) => {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
});
