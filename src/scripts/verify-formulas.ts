import ExcelJS from 'exceljs';
import fs from 'fs';
const filePath = 'C:/Users/USER/AppData/Roaming/safe/FinancialDashboard.xlsx';
(async () => {
  if (!fs.existsSync(filePath)) { console.error('File missing'); return; }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  console.log('Sheets:', wb.worksheets.map(ws=>ws.name));
  const wsForm = wb.getWorksheet('Formulas');
  if (wsForm) {
    wsForm.eachRow({includeEmpty:false}, (row, rowNumber) => {
      const cellA = row.getCell('A').value;
      const cellB = row.getCell('B').value;
      console.log(`Row ${rowNumber}: ${cellA} = ${JSON.stringify(cellB)}`);
    });
  }
})();
