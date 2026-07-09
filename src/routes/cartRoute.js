const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const auth = require('../middlewares/auth');

router.get('/', auth, cartController.getCart);
router.post('/', auth, cartController.addToCart);
router.put('/:id', auth, cartController.updateCartItem);
router.delete('/:id', auth, cartController.removeFromCart);
router.delete('/', auth, cartController.clearCart);

module.exports = router;
