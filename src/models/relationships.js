const User = require('./userModel');
const Role = require('./roleModel');
const UserRole = require('./userRoleModel');
const RefreshToken = require('./refreshTokenModel');
const Product = require('./productModel');
const Category = require('./categoryModel');
const Brand = require('./brandModel');
const CartItem = require('./cartItemModel');
const Order = require('./orderModel');
const OrderItem = require('./orderItemModel');
const ProductVariant = require('./productVariantModel');
const ProductDetail = require('./productDetailModel');
const ProductImage = require('./productImageModel');
const ProductReview = require('./productReviewModel');
const Supplier = require('./supplierModel');
const PurchaseOrder = require('./purchaseOrderModel');
const PurchaseOrderItem = require('./purchaseOrderItemModel');
const FlashSale = require('./flashSaleModel');
const UserProductInteraction = require('./userProductInteractionModel');
const TradeProduct = require('./tradeProductModel');
const TradeProductImage = require('./tradeProductImageModel');
const TradeOffer = require('./tradeOfferModel');
const SupportMessage = require('./supportMessageModel');
// User & Role Associations
User.belongsToMany(Role, {
    through: UserRole,
    foreignKey: 'user_id',
    otherKey: 'role_id',
    as: 'roles'
});

Role.belongsToMany(User, {
    through: UserRole,
    foreignKey: 'role_id',
    otherKey: 'user_id',
    as: 'users'
});

User.hasMany(RefreshToken, {
    foreignKey: 'user_id',
    as: 'refreshTokens',
    onDelete: 'CASCADE'
});

RefreshToken.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
});

// Audit Trails (created_by / updated_by)
const addAuditAssociations = (Model) => {
    Model.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
    Model.belongsTo(User, { foreignKey: 'updated_by', as: 'updater' });
};

addAuditAssociations(Category);
addAuditAssociations(Brand);
addAuditAssociations(Product);
addAuditAssociations(Supplier);
addAuditAssociations(PurchaseOrder);
addAuditAssociations(TradeProduct);

// Product Associations
Product.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });
Category.hasMany(Product, { foreignKey: 'category_id', as: 'products' });

Product.belongsTo(Brand, { foreignKey: 'brand_id', as: 'brand' });
Brand.hasMany(Product, { foreignKey: 'brand_id', as: 'products' });

// Product Variant Associations
Product.hasMany(ProductVariant, { foreignKey: 'product_id', as: 'variants', onDelete: 'CASCADE' });
ProductVariant.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

// Product Detail Associations
Product.hasOne(ProductDetail, { foreignKey: 'product_id', as: 'detail', onDelete: 'CASCADE' });
ProductDetail.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

// Product Image Associations
Product.hasMany(ProductImage, { foreignKey: 'product_id', as: 'images', onDelete: 'CASCADE' });
ProductImage.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

ProductVariant.hasMany(ProductImage, { foreignKey: 'product_variant_id', as: 'images', onDelete: 'CASCADE' });
ProductImage.belongsTo(ProductVariant, { foreignKey: 'product_variant_id', as: 'variant' });

// Product Review Associations
Product.hasMany(ProductReview, { foreignKey: 'product_id', as: 'reviews', onDelete: 'CASCADE' });
ProductReview.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

User.hasMany(ProductReview, { foreignKey: 'user_id', as: 'reviews', onDelete: 'CASCADE' });
ProductReview.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Cart Item Associations
User.hasMany(CartItem, { foreignKey: 'user_id', as: 'cartItems' });
CartItem.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Product.hasMany(CartItem, { foreignKey: 'product_id', as: 'cartItems' });
CartItem.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

ProductVariant.hasMany(CartItem, { foreignKey: 'variant_id', as: 'cartItems' });
CartItem.belongsTo(ProductVariant, { foreignKey: 'variant_id', as: 'variant' });

// Order & OrderItem Associations
User.hasMany(Order, { foreignKey: 'user_id', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items', onDelete: 'CASCADE' });
OrderItem.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

Product.hasMany(OrderItem, { foreignKey: 'product_id', as: 'orderItems' });
OrderItem.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

ProductVariant.hasMany(OrderItem, { foreignKey: 'variant_id', as: 'orderItems' });
OrderItem.belongsTo(ProductVariant, { foreignKey: 'variant_id', as: 'variant' });

// Supplier & Purchase Order Associations
Supplier.hasMany(PurchaseOrder, { foreignKey: 'supplier_id', as: 'purchaseOrders' });
PurchaseOrder.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });

PurchaseOrder.hasMany(PurchaseOrderItem, { foreignKey: 'purchase_order_id', as: 'items', onDelete: 'CASCADE' });
PurchaseOrderItem.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id', as: 'purchaseOrder' });

Product.hasMany(PurchaseOrderItem, { foreignKey: 'product_id', as: 'purchaseItems' });
PurchaseOrderItem.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

ProductVariant.hasMany(PurchaseOrderItem, { foreignKey: 'product_variant_id', as: 'purchaseItems' });
PurchaseOrderItem.belongsTo(ProductVariant, { foreignKey: 'product_variant_id', as: 'variant' });

// Flash Sale → Product association
FlashSale.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
Product.hasMany(FlashSale, { foreignKey: 'product_id', as: 'flashSales' });
User.hasMany(UserProductInteraction, {
    foreignKey: 'user_id',
    as: 'productInteractions',
    onDelete: 'CASCADE',
});

UserProductInteraction.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user',
});


Product.hasMany(UserProductInteraction, {
    foreignKey: 'product_id',
    as: 'userInteractions',
    onDelete: 'CASCADE',
});

UserProductInteraction.belongsTo(Product, {
    foreignKey: 'product_id',
    as: 'product',
});

// Trade Product Associations
User.hasMany(TradeProduct, { foreignKey: 'user_id', as: 'tradeProducts', onDelete: 'CASCADE' });
TradeProduct.belongsTo(User, { foreignKey: 'user_id', as: 'owner' });

TradeProduct.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });
Category.hasMany(TradeProduct, { foreignKey: 'category_id', as: 'tradeProducts' });

TradeProduct.belongsTo(Category, { foreignKey: 'target_category_id', as: 'targetCategory' });

TradeProduct.belongsTo(Brand, { foreignKey: 'brand_id', as: 'brand' });
Brand.hasMany(TradeProduct, { foreignKey: 'brand_id', as: 'tradeProducts' });

TradeProduct.hasMany(TradeProductImage, { foreignKey: 'trade_product_id', as: 'images', onDelete: 'CASCADE' });
TradeProductImage.belongsTo(TradeProduct, { foreignKey: 'trade_product_id', as: 'tradeProduct' });

// Trade Product ↔ Order & Store Product Associations (Listing from Order History)
TradeProduct.belongsTo(Order, { foreignKey: 'order_id', as: 'sourceOrder' });
Order.hasMany(TradeProduct, { foreignKey: 'order_id', as: 'listedTradeProducts' });

TradeProduct.belongsTo(OrderItem, { foreignKey: 'order_item_id', as: 'sourceOrderItem' });
OrderItem.hasOne(TradeProduct, { foreignKey: 'order_item_id', as: 'tradeProduct' });

TradeProduct.belongsTo(Product, { foreignKey: 'original_product_id', as: 'originalProduct' });
Product.hasMany(TradeProduct, { foreignKey: 'original_product_id', as: 'tradeListings' });

// Order ↔ TradeProduct for Trade-In Discount
Order.belongsTo(TradeProduct, { foreignKey: 'trade_in_product_id', as: 'tradeInProduct' });
TradeProduct.hasOne(Order, { foreignKey: 'trade_in_product_id', as: 'appliedTradeInOrder' });

// Trade Offer Associations
TradeProduct.hasMany(TradeOffer, { foreignKey: 'trade_product_id', as: 'offers', onDelete: 'CASCADE' });
TradeOffer.belongsTo(TradeProduct, { foreignKey: 'trade_product_id', as: 'tradeProduct' });

TradeOffer.belongsTo(TradeProduct, { foreignKey: 'offered_product_id', as: 'offeredProduct' });

User.hasMany(TradeOffer, { foreignKey: 'sender_id', as: 'sentTradeOffers', onDelete: 'CASCADE' });
TradeOffer.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });

User.hasMany(TradeOffer, { foreignKey: 'receiver_id', as: 'receivedTradeOffers', onDelete: 'CASCADE' });
TradeOffer.belongsTo(User, { foreignKey: 'receiver_id', as: 'receiver' });


// Support Message Associations
User.hasMany(SupportMessage, { foreignKey: 'user_id', as: 'supportMessages', onDelete: 'CASCADE' });
SupportMessage.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(SupportMessage, { foreignKey: 'admin_id', as: 'assignedMessages', onDelete: 'SET NULL' });
SupportMessage.belongsTo(User, { foreignKey: 'admin_id', as: 'admin' });

module.exports = {
    User,
    Role,
    UserRole,
    RefreshToken,
    Product,
    Category,
    Brand,
    CartItem,
    Order,
    OrderItem,
    ProductVariant,
    ProductDetail,
    ProductImage,
    ProductReview,
    Supplier,
    PurchaseOrder,
    PurchaseOrderItem,
    FlashSale,
    UserProductInteraction,
    TradeProduct,
    TradeProductImage,
    TradeOffer,
    SupportMessage
};