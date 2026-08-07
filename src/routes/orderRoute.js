const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middlewares/auth');

router.post('/checkout', auth, orderController.checkout);
router.get('/', auth, orderController.getOrders);
router.get('/admin/all', auth, orderController.getAdminOrders);
router.post('/admin/create', auth, orderController.createAdminOrder);
router.get('/:id/checkout-info', orderController.getCheckoutInfo);
router.get('/:id', auth, orderController.getOrderById);
router.put('/:id/status', auth, orderController.updateOrderStatus);
router.delete('/:id', auth, orderController.deleteOrder);

// Public or semi-private webhook/simulated payment URL callback
router.post('/:id/pay', orderController.payOrder);

module.exports = router;
