const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const auth = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.post("/", upload.single('image'), productController.create);
router.get("/", productController.findAll);
router.get("/true", productController.findAllTrue);
router.get("/:id", productController.findOne);
router.put("/:id", upload.single('image'), productController.update);
router.delete("/:id", productController.delete);

module.exports = router;
