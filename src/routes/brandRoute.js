const express = require('express');
const router = express.Router();
const Brand = require('../controllers/brandController');
const auth = require('../middlewares/auth');

router.post('/', auth, Brand.create);
router.get('/', Brand.findAll);
router.get('/:id', Brand.findOne);
router.put('/:id', auth, Brand.update);
router.delete('/:id', auth, Brand.delete);

module.exports = router;