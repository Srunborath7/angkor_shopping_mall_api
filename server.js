const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

require("dotenv").config();
const http = require("http");
const app = require("./src/app");
const sequelize = require("./src/config/db");

const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

sequelize.sync()
  .then(() => {
    console.log("DB synced");

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.log("DB error:", err);
  });