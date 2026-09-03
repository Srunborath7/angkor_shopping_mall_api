require("dotenv").config();
const http = require("http");
const app = require("./src/app");
const sequelize = require("./src/config/db");
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

const { setupWebhook } = require("./src/config/telegram");
const { startRecommendationCleanupJob } = require("./src/services/recommendationService");
const { seedPermissions } = require("./src/utils/seedPermissions");

// 1. Start HTTP Server immediately so Render health check passes without timing out
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT} (0.0.0.0)`);
});

// 2. Connect DB and perform initialization asynchronously
(async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connected successfully.");

    try {
      if (process.env.NODE_ENV !== "production") {
        await sequelize.sync();
      }
      await seedPermissions();
    } catch (seedErr) {
      console.error("Permission seeding / sync error:", seedErr.message);
    }

    try {
      await setupWebhook();
    } catch (whErr) {
      console.error("Telegram webhook setup warning:", whErr.message);
    }

    // Start automated 2-day retention cleanup job (runs every 60 minutes)
    startRecommendationCleanupJob(60, 2);
  } catch (err) {
    console.error("Database connection failed:", err);
  }
})();
