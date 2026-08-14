const express = require('express');
const router = express.Router();
const tradeProductController = require('../controllers/tradeProductController');
const tradeOfferController = require('../controllers/tradeOfferController');
const auth = require('../middlewares/auth');
const optionalAuth = require('../middlewares/optionalAuth');
const upload = require('../middlewares/upload');

// User listings & offer submission — require auth
router.get('/my', auth, tradeProductController.findMyListings);

router.post(
    '/',
    auth,
    upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'gallery', maxCount: 5 }
    ]),
    tradeProductController.create
);

router.put('/:id', auth, upload.single('image'), tradeProductController.update);
router.delete('/:id', auth, tradeProductController.delete);

// Offer creation directly under a specific product
router.post('/:id/offers', auth, tradeOfferController.createOfferForProduct);

// Public / open browsing
router.get('/', optionalAuth, tradeProductController.findAll);
router.get('/:id', optionalAuth, tradeProductController.findOne);

module.exports = router;
