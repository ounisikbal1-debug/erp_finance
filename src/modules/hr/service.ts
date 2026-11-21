import prisma from '../../core/models/prisma';

class HRService {
  static async listEmployees() {
    return await prisma.employee.findMany();
  }

  static async createEmployee(data: any) {
    return await prisma.employee.create({ data });
  }
}

export default HRService;
