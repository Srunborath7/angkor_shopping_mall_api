const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const auth = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.post("/", auth, upload.single('image'), productController.create);
router.get("/", productController.findAll);
router.get("/true", productController.findAllTrue);
router.get("/:id", productController.findOne);
router.put("/:id", auth, upload.single('image'), productController.update);
router.delete("/:id", auth, productController.delete);

module.exports = router;
