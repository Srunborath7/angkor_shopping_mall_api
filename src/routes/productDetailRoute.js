const express = require('express');
const router = express.Router();
const productDetailController = require('../controllers/productDetailController');
const auth = require('../middlewares/auth');

router.post('/products/:productId/detail', auth, productDetailController.upsert);
router.put('/products/:productId/detail', auth, productDetailController.upsert);
router.get('/products/:productId/detail', productDetailController.findOne);

module.exports = router;
