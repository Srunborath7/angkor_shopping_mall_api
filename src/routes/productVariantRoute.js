const express = require('express');
   const router = express.Router();
   const productVariantController = require('../controllers/productVariantController');
   const auth = require('../middlewares/auth');
   const upload = require('../middlewares/upload');

   // Product-specific variants
   router.post('/products/:productId/variants', auth, upload.single('image'), productVariantController.create);
   router.get('/products/:productId/variants', productVariantController.findAll);

   // Direct variant actions
   router.get('/variants/:id', productVariantController.findOne);
   router.put('/variants/:id', auth, upload.single('image'), productVariantController.update);
   router.patch('/variants/:id/inventory', auth, productVariantController.updateInventory);
   router.delete('/variants/:id', auth, productVariantController.delete);

   module.exports = router;
