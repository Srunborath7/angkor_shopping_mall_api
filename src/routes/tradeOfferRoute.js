const express = require('express');
const router = express.Router();
const tradeOfferController = require('../controllers/tradeOfferController');
const auth = require('../middlewares/auth');

// All trade offer operations require authentication
router.use(auth);

router.post('/', tradeOfferController.createOfferForProduct);
router.get('/received', tradeOfferController.getReceivedOffers);
router.get('/sent', tradeOfferController.getSentOffers);
router.get('/:id', tradeOfferController.getOfferById);
router.patch('/:id/status', tradeOfferController.updateOfferStatus);
router.put('/:id/status', tradeOfferController.updateOfferStatus);

module.exports = router;
