import prisma from '../../core/models/prisma';

class ControllingService {
  static async listCostCenters() {
    // Placeholder – adapt when a CostCenter model is added
    return [];
  }

  static async createCostCenter(data: any) {
    // Placeholder – no DB table yet
    return { ...data, id: 'cc_' + Date.now() };
  }
}

export default ControllingService;
