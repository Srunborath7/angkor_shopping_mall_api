const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const auth = require('../middlewares/auth');
const optionalAuth = require('../middlewares/optionalAuth');

router.post('/khqr/generate', optionalAuth, paymentController.generateKHQR);
router.get('/khqr/check-status/:md5', paymentController.checkKHQRStatus);
router.post('/khqr/simulate', paymentController.simulatePayment);

module.exports = router;
