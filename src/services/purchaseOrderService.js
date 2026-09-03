const {
    sequelize,
    PurchaseOrder,
    PurchaseOrderItem,
    Supplier,
    Product,
    ProductVariant,
    User
} = require('../models/relationships');

class PurchaseOrderService {
    async createPurchaseOrder(data) {
        const t = await sequelize.transaction();
        try {
            const { supplier_id, order_date, status = 'pending', notes, items = [], created_by } = data;

            // Validate supplier
            const supplier = await Supplier.findByPk(supplier_id, { transaction: t });
            if (!supplier) {
                throw new Error('Supplier not found');
            }

            // Auto-generate PO number if missing
            const po_number = data.po_number || `PO-${Date.now()}`;

            let total_amount = 0;
            const preparedItems = [];

            for (const item of items) {
                const { product_id, product_variant_id, quantity, unit_cost } = item;
                const product = await Product.findByPk(product_id, { transaction: t });
                if (!product) {
                    throw new Error(`Product with ID ${product_id} not found`);
                }

                if (product_variant_id) {
                    const variant = await ProductVariant.findByPk(product_variant_id, { transaction: t });
                    if (!variant) {
                        throw new Error(`Product Variant with ID ${product_variant_id} not found`);
                    }
                }

                const qty = parseInt(quantity) || 1;
                const cost = parseFloat(unit_cost) || 0.0;
                const total_cost = parseFloat((qty * cost).toFixed(2));

                total_amount += total_cost;

                preparedItems.push({
                    product_id,
                    product_variant_id: product_variant_id || null,
                    quantity: qty,
                    unit_cost: cost,
                    total_cost
                });
            }

            // Create Purchase Order Header
            const purchaseOrder = await PurchaseOrder.create({
                po_number,
                supplier_id,
                order_date: order_date || new Date(),
                status,
                total_amount: parseFloat(total_amount.toFixed(2)),
                notes,
                created_by,
                updated_by: created_by
            }, { transaction: t });

            // Create Items
            for (const item of preparedItems) {
                await PurchaseOrderItem.create({
                    purchase_order_id: purchaseOrder.id,
                    ...item
                }, { transaction: t });

                // If status is immediately received, increase product/variant stock
                if (status === 'received') {
                    await this._increaseStock(item.product_id, item.product_variant_id, item.quantity, t);
                }
            }

            await t.commit();

            return await this.getPurchaseOrderById(purchaseOrder.id);
        } catch (error) {
            if (t && !t.finished) {
                await t.rollback();
            }
            throw error;
        }
    }

    async getAllPurchaseOrders() {
        return await PurchaseOrder.findAll({
            include: [
                { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'contact_person', 'email', 'phone'], required: false }
            ],
            order: [['created_at', 'DESC']]
        });
    }

    async getPurchaseOrderById(id) {
        const purchaseOrder = await PurchaseOrder.findByPk(id, {
            include: [
                { model: Supplier, as: 'supplier', required: false }
            ]
        });

        if (!purchaseOrder) {
            throw new Error('Purchase Order not found');
        }

        const items = await PurchaseOrderItem.findAll({
            where: { purchase_order_id: id },
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name', 'price', 'stock_quantity'], required: false },
                { model: ProductVariant, as: 'variant', attributes: ['id', 'sku', 'price', 'attributes'], required: false }
            ]
        });

        const plain = purchaseOrder.toJSON ? purchaseOrder.toJSON() : { ...purchaseOrder };
        plain.items = items || [];
        return plain;
    }

    async updateStatus(id, newStatus, updated_by) {
        const validStatuses = ['pending', 'received', 'cancelled'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Invalid status. Allowed values: ${validStatuses.join(', ')}`);
        }

        const t = await sequelize.transaction();
        try {
            const purchaseOrder = await PurchaseOrder.findByPk(id, {
                include: [{ model: PurchaseOrderItem, as: 'items' }],
                transaction: t
            });

            if (!purchaseOrder) {
                throw new Error('Purchase Order not found');
            }

            const oldStatus = purchaseOrder.status;

            if (oldStatus === newStatus) {
                await t.commit();
                return await this.getPurchaseOrderById(id);
            }

            // Status transition logic for stock adjustment
            if (oldStatus !== 'received' && newStatus === 'received') {
                // Add stock for all items
                for (const item of purchaseOrder.items) {
                    await this._increaseStock(item.product_id, item.product_variant_id, item.quantity, t);
                }
            } else if (oldStatus === 'received' && newStatus === 'cancelled') {
                // Deduct stock if order is cancelled after being received
                for (const item of purchaseOrder.items) {
                    await this._decreaseStock(item.product_id, item.product_variant_id, item.quantity, t);
                }
            }

            await purchaseOrder.update({
                status: newStatus,
                updated_by
            }, { transaction: t });

            await t.commit();
            return await this.getPurchaseOrderById(id);
        } catch (error) {
            if (t && !t.finished) {
                await t.rollback();
            }
            throw error;
        }
    }

    async deletePurchaseOrder(id) {
        const purchaseOrder = await PurchaseOrder.findByPk(id);
        if (!purchaseOrder) {
            throw new Error('Purchase Order not found');
        }

        if (purchaseOrder.status === 'received') {
            throw new Error('Cannot delete a received Purchase Order. Please cancel it first.');
        }

        await purchaseOrder.destroy();
        return true;
    }

    async _increaseStock(product_id, product_variant_id, quantity, transaction) {
        const product = await Product.findByPk(product_id, { transaction });
        if (product) {
            await product.increment('stock_quantity', { by: quantity, transaction });
        }

        if (product_variant_id) {
            const variant = await ProductVariant.findByPk(product_variant_id, { transaction });
            if (variant) {
                await variant.increment('stock_quantity', { by: quantity, transaction });
            }
        }
    }

    async _decreaseStock(product_id, product_variant_id, quantity, transaction) {
        const product = await Product.findByPk(product_id, { transaction });
        if (product) {
            await product.decrement('stock_quantity', { by: quantity, transaction });
        }

        if (product_variant_id) {
            const variant = await ProductVariant.findByPk(product_variant_id, { transaction });
            if (variant) {
                await variant.decrement('stock_quantity', { by: quantity, transaction });
            }
        }
    }
}

module.exports = new PurchaseOrderService();
