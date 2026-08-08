const express = require('express');
const router = express.Router();
const flashSaleController = require('../controllers/flashSaleController');

router.post('/', flashSaleController.create);
router.get('/', flashSaleController.findAll);
router.get('/active', flashSaleController.findActive);
router.put('/:id', flashSaleController.update);
router.delete('/:id', flashSaleController.delete);

module.exports = router;
