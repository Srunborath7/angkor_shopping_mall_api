const Brand = require('../models/brandModel');

class BrandService {

  async createBrand(data) {
    return await Brand.create(data);
  }

  async getAllBrands() {
    return await Brand.findAll();
  }

  async getBrandById(id) {
    return await Brand.findByPk(id);
  }

  async updateBrand(id, data) {
    const brand = await Brand.findByPk(id);

    if (!brand) {
      throw new Error('Brand not found');
    }

    await brand.update(data);

    return brand;
  }

  async deleteBrand(id) {
    const brand = await Brand.findByPk(id);

    if (!brand) {
      throw new Error('Brand not found');
    }

    await brand.destroy();

    return true;
  }
}

module.exports = new BrandService();