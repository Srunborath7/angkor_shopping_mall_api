const Brand = require('../../../src/models/brandModel');
const brandService = require('../../../src/services/brandService');

// Mock Sequelize model
jest.mock('../../../src/models/brandModel');
jest.mock('../../../src/models/userModel');

describe('Brand Service (src/services/brandService.js)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createBrand()', () => {
    it('should create a new brand record', async () => {
      const input = { name: 'Nike', created_by: 1 };
      const expectedRecord = { id: 1, ...input };

      Brand.create.mockResolvedValue(expectedRecord);

      const result = await brandService.createBrand(input);

      expect(Brand.create).toHaveBeenCalledWith(input);
      expect(result).toEqual(expectedRecord);
    });
  });

  describe('getBrandById()', () => {
    it('should retrieve a brand by ID with relationships', async () => {
      const mockBrand = { id: 5, name: 'Adidas' };
      Brand.findByPk.mockResolvedValue(mockBrand);

      const result = await brandService.getBrandById(5);

      expect(Brand.findByPk).toHaveBeenCalledWith(5, expect.any(Object));
      expect(result).toEqual(mockBrand);
    });
  });

  describe('updateBrand()', () => {
    it('should throw an error if brand does not exist', async () => {
      Brand.findByPk.mockResolvedValue(null);

      await expect(brandService.updateBrand(99, { name: 'Puma' })).rejects.toThrow('Brand not found');
    });

    it('should update brand when it exists', async () => {
      const mockInstance = {
        id: 1,
        name: 'Old Name',
        update: jest.fn().mockResolvedValue(true)
      };

      Brand.findByPk
        .mockResolvedValueOnce(mockInstance) // for lookup in updateBrand
        .mockResolvedValueOnce({ id: 1, name: 'New Name' }); // for getBrandById

      const result = await brandService.updateBrand(1, { name: 'New Name' });

      expect(mockInstance.update).toHaveBeenCalledWith({ name: 'New Name' });
      expect(result).toEqual({ id: 1, name: 'New Name' });
    });
  });

  describe('deleteBrand()', () => {
    it('should delete brand when found', async () => {
      const mockInstance = {
        id: 2,
        destroy: jest.fn().mockResolvedValue(true)
      };

      Brand.findByPk.mockResolvedValue(mockInstance);

      const result = await brandService.deleteBrand(2);

      expect(mockInstance.destroy).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should throw error when deleting non-existent brand', async () => {
      Brand.findByPk.mockResolvedValue(null);

      await expect(brandService.deleteBrand(999)).rejects.toThrow('Brand not found');
    });
  });
});
