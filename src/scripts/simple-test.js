const ExcelJS = require('exceljs');
(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Test');
  ws.addRow(['Hello']);
  try {
    await wb.xlsx.writeFile('C:/Users/USER/AppData/Roaming/safe/Test.xlsx');
    console.log('written');
  } catch(e){
    console.error('error', e);
  }
})();