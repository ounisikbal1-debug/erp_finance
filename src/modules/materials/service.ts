import prisma from '../../core/models/prisma';

class MaterialsService {
  static async list() {
    return await prisma.material.findMany();
  }

  static async create(data: any) {
    return await prisma.material.create({ data });
  }
}

export default MaterialsService;
