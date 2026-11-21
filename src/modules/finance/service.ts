import prisma from '../../data/prisma/client';

class FinanceService {
  static async createInvoice(data: any) {
    return await prisma.invoice.create({ data });
  }

  static async listInvoices() {
    return await prisma.invoice.findMany();
  }
}

export default FinanceService;
