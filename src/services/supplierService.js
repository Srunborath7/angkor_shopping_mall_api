const { Supplier, User, PurchaseOrder } = require('../models/relationships');

class SupplierService {
    async createSupplier(data) {
        return await Supplier.create(data);
    }

    async getAllSuppliers() {
        return await Supplier.findAll({
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
                { model: User, as: 'updater', attributes: ['id', 'name', 'email'] }
            ],
            order: [['created_at', 'DESC']]
        });
    }

    async getSupplierById(id) {
        const supplier = await Supplier.findByPk(id, {
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
                { model: User, as: 'updater', attributes: ['id', 'name', 'email'] },
                { model: PurchaseOrder, as: 'purchaseOrders' }
            ]
        });

        if (!supplier) {
            throw new Error('Supplier not found');
        }

        return supplier;
    }

    async updateSupplier(id, data) {
        const supplier = await Supplier.findByPk(id);

        if (!supplier) {
            throw new Error('Supplier not found');
        }

        await supplier.update(data);
        return await this.getSupplierById(id);
    }

    async deleteSupplier(id) {
        const supplier = await Supplier.findByPk(id);

        if (!supplier) {
            throw new Error('Supplier not found');
        }

        await supplier.destroy();
        return true;
    }
}

module.exports = new SupplierService();
