const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const auth = require('../middlewares/auth');

router.post('/', auth, deliveryController.createOrUpdateDelivery);
router.get('/', auth, deliveryController.getDeliveries);
router.get('/order/:orderId', auth, deliveryController.getDeliveryByOrderId);
router.put('/:id', auth, deliveryController.updateDelivery);

module.exports = router;
