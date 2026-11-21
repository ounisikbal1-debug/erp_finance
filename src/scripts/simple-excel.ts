import ExcelJS from 'exceljs';
(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Hello']);
  const filePath = 'C:/Users/USER/AppData/Roaming/safe/FinancialDashboard.xlsx';
  await wb.xlsx.writeFile(filePath);
  console.log('✅ Simple Excel generated →', filePath);
})();
