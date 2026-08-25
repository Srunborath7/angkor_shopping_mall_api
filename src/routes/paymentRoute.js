const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const optionalAuth = require('../middlewares/optionalAuth');

// --- ABA PayWay Routes ---
router.post('/aba/generate-qr', optionalAuth, paymentController.generateABAQR);
router.get('/aba/check-status/:tran_id', paymentController.checkABAStatus);
router.post('/aba/simulate', paymentController.simulatePayment);

// --- Backward Compatibility Aliases ---
router.post('/khqr/generate', optionalAuth, paymentController.generateABAQR);
router.get('/khqr/check-status/:md5', paymentController.checkABAStatus);
router.post('/khqr/simulate', paymentController.simulatePayment);

module.exports = router;