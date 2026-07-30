const express = require('express');
const router = express.Router();
const productImageController = require('../controllers/productImageController');
const auth = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.post('/products/:productId/images', auth, upload.single('image'), productImageController.upload);
router.get('/products/:productId/images', productImageController.findAll);
router.delete('/images/:id', auth, productImageController.delete);

module.exports = router;
