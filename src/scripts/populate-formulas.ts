import ExcelJS from 'exceljs';
import fs from 'fs';

const filePath = 'C:/Users/USER/AppData/Roaming/safe/FinancialDashboard.xlsx';

(async () => {
  // If file exists, load it; otherwise create a new workbook
  const wb = new ExcelJS.Workbook();
  if (fs.existsSync(filePath)) {
    await wb.xlsx.readFile(filePath);
    console.log('✅ Loaded existing workbook');
  } else {
    console.log('⚠️ No existing file, creating new workbook');
  }

  // Create / replace Formulas sheet
  let wsForm = wb.getWorksheet('Formulas');
  if (wsForm) wb.removeWorksheet(wsForm.id);
  wsForm = wb.addWorksheet('Formulas');
  wsForm.getCell('A1').value = 'Total CA';
  wsForm.getCell('B1').value = { formula: 'SUM(Invoices!B2:B1048576)' };
  wsForm.getCell('A2').value = 'Cost of Sales';
  wsForm.getCell('B2').value = { formula: 'SUMPRODUCT(Materials!C2:C1048576,Materials!D2:D1048576)' };
  wsForm.getCell('A3').value = 'Gross Margin';
  wsForm.getCell('B3').value = { formula: 'B1-B2' };
  wsForm.getCell('A4').value = 'Gross Margin %';
  wsForm.getCell('B4').value = { formula: 'IF(B1=0,0,B3/B1)' };
  wsForm.getCell('A5').value = 'Total Inventory';
  wsForm.getCell('B5').value = { formula: 'SUM(Materials!C2:C1048576)' };
  wsForm.getCell('A6').value = 'Nb Employees';
  wsForm.getCell('B6').value = { formula: 'COUNTA(Employees!A2:A1048576)' };

  // Ensure old file removed before writing
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log('✅ Existing file removed');
  }

  await wb.xlsx.writeFile(filePath);
  console.log('✅ Workbook saved with formulas →', filePath);
})();
