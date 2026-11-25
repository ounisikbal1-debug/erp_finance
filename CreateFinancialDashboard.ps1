# CreateFinancialDashboard.ps1
# This script creates an Excel workbook with all required worksheets and formulas.
# It uses the builtâ€‘in COM automation (Excel.Application), so no external PowerShell modules are needed.
# The workbook is saved to C:\Users\USER\AppData\Roaming\safe\FinancialDashboard.xlsx

$excelPath = "C:\Users\USER\AppData\Roaming\safe\FinancialDashboard.xlsx"

# If the file already exists, delete it to avoid overwrite issues
if (Test-Path $excelPath) {
    Remove-Item $excelPath -Force
}

# Start Excel COM object
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

# Add a new workbook
$workbook = $excel.Workbooks.Add()

# Helper function to add a worksheet if it doesn't already exist
function Add-Worksheet($name) {
    $ws = $null
    foreach ($sheet in $workbook.Worksheets) {
        if ($sheet.Name -eq $name) { $ws = $sheet; break }
    }
    if (-not $ws) {
        $ws = $workbook.Worksheets.Add()
        $ws.Name = $name
    }
    return $ws
}

# List of required sheets (except Formulas which we will add later)
$requiredSheets = @(
    "Invoices",
    "Materials",
    "SalesOrders",
    "Employees",
    "KPIs",
    "Dashboard",
    "Recommendations",
    "Decisions",
    "PaieManuelle"
)

foreach ($sheetName in $requiredSheets) {
    Add-Worksheet $sheetName | Out-Null
}

# Add Formulas sheet
$formulasSheet = Add-Worksheet "Formulas"

# Write headers for readability
$formulasSheet.Cells.Item(1,1).Value = "Formula Description"
$formulasSheet.Cells.Item(1,2).Value = "Formula"

# Populate the formulas (row by row)
$rows = @(
    @{Desc = "Total Invoices"; Formula = "=SUM(Invoices!B2:B1048576)"},
    @{Desc = "Materials Weighted Sum"; Formula = "=SUMPRODUCT(Materials!C2:C1048576,Materials!D2:D1048576)"},
    @{Desc = "Difference B1-B2"; Formula = "=B1-B2"},
    @{Desc = "Conditional Ratio"; Formula = "=IF(B1=0,0,B3/B1)"},
    @{Desc = "Sum Materials C"; Formula = "=SUM(Materials!C2:C1048576)"},
    @{Desc = "Count Employees"; Formula = "=COUNTA(Employees!A2:A1048576)"}
)

$rowIndex = 2
foreach ($r in $rows) {
    $formulasSheet.Cells.Item($rowIndex,1).Value = $r.Desc
    $formulasSheet.Cells.Item($rowIndex,2).Formula = $r.Formula
    $rowIndex++
}

# Autoâ€‘fit columns for readability
$formulasSheet.Columns.AutoFit()

# Save the workbook
$workbook.SaveAs($excelPath)

# Clean up COM objects
$workbook.Close()
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($workbook) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()
[GC]::WaitForPendingFinalizers()

Write-Host "FinancialDashboard.xlsx created at $excelPath"
