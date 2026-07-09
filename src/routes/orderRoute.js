const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middlewares/auth');

router.post('/checkout', auth, orderController.checkout);
router.get('/', auth, orderController.getOrders);
router.get('/:id/checkout-info', orderController.getCheckoutInfo);
router.get('/:id', auth, orderController.getOrderById);

// Public or semi-private webhook/simulated payment URL callback
router.post('/:id/pay', orderController.payOrder);

module.exports = router;
