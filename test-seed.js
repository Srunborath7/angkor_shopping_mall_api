require("dotenv").config();
const sequelize = require("./src/config/db");
const productController = require("./src/controllers/productController");

async function main() {
    try {
        console.log("Connecting to DB...");
        await sequelize.authenticate();
        console.log("Seeding database...");
        
        const mockRes = {
            status: function(code) {
                console.log("Status:", code);
                return this;
            },
            json: function(data) {
                console.log("Response:", JSON.stringify(data, null, 2));
                return this;
            }
        };
        
        await productController.seed(null, mockRes);
        console.log("Direct seeding script finished.");
        process.exit(0);
    } catch (err) {
        console.error("Seeding failed:", err);
        process.exit(1);
    }
}

main();
