require("dotenv").config();
const http = require("http");
const app = require("./src/app");
const sequelize = require("./src/config/db");
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const { setupWebhook } = require("./src/config/telegram");
const { startRecommendationCleanupJob } = require("./src/services/recommendationService");

sequelize
  .sync({ alter: true })
  .then(() => {
    console.log("Database connected.");
    server.listen(PORT, () => {
      console.log(`Server running on port http://localhost:${PORT}`);
    });
    setupWebhook();
    // Start automated 2-day retention cleanup job (runs every 60 minutes)
    startRecommendationCleanupJob(60, 2);
  })
  .catch((err) => {
    console.error("Database connection failed:", err);
  });