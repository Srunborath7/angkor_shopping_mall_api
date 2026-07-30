const express = require('express');
const router = express.Router();
const productReviewController = require('../controllers/productReviewController');
const auth = require('../middlewares/auth');

router.post('/products/:productId/reviews', auth, productReviewController.create);
router.get('/products/:productId/reviews', productReviewController.findAll);
router.put('/reviews/:id', auth, productReviewController.update);
router.delete('/reviews/:id', auth, productReviewController.delete);

module.exports = router;
