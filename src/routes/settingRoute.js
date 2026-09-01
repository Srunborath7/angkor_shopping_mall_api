const express = require("express");
const router = express.Router();
const settingController = require("../controllers/settingController");

// Public endpoints
router.get("/store-profile", settingController.getStoreProfile);
router.get("/:key", settingController.getSetting);

// Update endpoints
router.put("/store-profile", settingController.updateStoreProfile);
router.post("/store-profile", settingController.updateStoreProfile);
router.post("/", settingController.saveSetting);
router.put("/", settingController.saveSetting);

module.exports = router;
