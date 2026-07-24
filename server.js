require("dotenv").config();
const http = require("http");
const app = require("./src/app");
const sequelize = require("./src/config/db");
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const {setupWebhook} = require("./src/config/telegram");

sequelize
  .sync()
  .then(() => {
    console.log("Database connected.");
    server.listen(PORT, () => {
      console.log(`Server running on port http://localhost:${PORT}`)

    });
    setupWebhook();
  })
  .catch((err) => {
    console.error("Database connection failed:", err);
  });