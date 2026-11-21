import prisma from '../../data/prisma/client';

class HRService {
  static async listEmployees() {
    return await prisma.employee.findMany();
  }

  static async createEmployee(data: any) {
    return await prisma.employee.create({ data });
  }
}

export default HRService;
