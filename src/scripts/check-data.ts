import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main(){
  const employeeCount = await prisma.employee.count();
  const materialCount = await prisma.material.count();
  const salesOrderCount = await prisma.salesOrder.count();
  const invoiceCount = await prisma.invoice.count();
  console.log('Counts:', {employeeCount, materialCount, salesOrderCount, invoiceCount});
}
main().catch(e=>{console.error(e)}).finally(()=>prisma.$disconnect());
