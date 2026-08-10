const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const auth         = require('../middlewares/auth');
const optionalAuth = require('../middlewares/optionalAuth');
const upload = require('../middlewares/upload');

// Admin routes — require full auth
router.post("/",    auth, upload.single('image'), productController.create);
router.put("/:id",  auth, upload.single('image'), productController.update);
router.delete("/:id", auth, productController.delete);

// Public routes — optionalAuth so logged-in users get interaction tracking
router.get("/",       optionalAuth, productController.findAll);
router.get("/true",   optionalAuth, productController.findAllTrue);
router.get("/:id",    optionalAuth, productController.findOne);

module.exports = router;
