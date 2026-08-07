const express = require('express');
const router = express.Router();
const purchaseOrderController = require('../controllers/purchaseOrderController');
const auth = require('../middlewares/auth');

router.post('/', auth, purchaseOrderController.create);
router.get('/', purchaseOrderController.findAll);
router.get('/:id', purchaseOrderController.findOne);
router.patch('/:id/status', auth, purchaseOrderController.updateStatus);
router.delete('/:id', auth, purchaseOrderController.delete);

module.exports = router;
