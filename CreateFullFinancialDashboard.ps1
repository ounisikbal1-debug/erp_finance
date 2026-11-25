# ==============================================================
# CreateFullFinancialDashboard.ps1
# GÃ©nÃ©ration d'un tableau de bord financier complet depuis Safe
# ==============================================================

# ------------------- 0ï¸âƒ£  PARAMÃˆTRES UTILISATEUR -------------------
$excelPath   = "C:\Users\USER\AppData\Roaming\safe\FinancialDashboard.xlsx"
$dbPath      = "C:\Users\USER\AppData\Roaming\safe\src\data\data.db"
$zipPath     = "$excelPath.zip"

# ---- Configuration eâ€‘mail (Ã  remplir une fois) ----
$smtpServer  = "smtp.exemple.com"          # serveur SMTP
$smtpPort    = 587                         # 25/465/587 selon le serveur
$smtpUser    = "votre.mail@exemple.com"    # login
$smtpPass    = "VOTRE_MOT_DE_PASSE_SMTP"   # mot de passe (ou token)
$mailFrom    = "votre.mail@exemple.com"
$mailTo = $null # will be set later
$mailSubject = "ðŸ“Š FinancialDashboard â€“ export du $(Get-Date -Format 'dd/MM/yyyy')"
$mailBody    = "Vous trouverez en piÃ¨ce jointe le tableau de bord financier gÃ©nÃ©rÃ©."

# ------------------- 1ï¸âƒ£  Chargement du module -------------------
Import-Module ImportExcel -ErrorAction Stop

# ------------------- 2ï¸âƒ£  Fonction d'accÃ¨s SQLite -------------------
function Get-TableData {
    param([string]$Sql)
    Add-Type -AssemblyName System.Data
    $dllPath = Join-Path (Split-Path $dbPath) "sqlite.dll"
    if (-not (Test-Path $dllPath)) {
        throw "sqlite.dll introuvable Ã  cÃ´tÃ© de $dbPath â€“ impossible de lire la base."
    }
    Add-Type -Path $dllPath -ErrorAction Stop
    $conn = New-Object System.Data.SQLite.SQLiteConnection "Data Source=$dbPath;Version=3;"
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $Sql
    $da  = New-Object System.Data.SQLite.SQLiteDataAdapter $cmd
    $dt  = New-Object System.Data.DataTable
    $da.Fill($dt) | Out-Null
    $conn.Close()
    return $dt
}

# ------------------- 3ï¸âƒ£  Nettoyage des anciens fichiers -------------------
if (Test-Path $excelPath) { Remove-Item $excelPath -Force }
if (Test-Path $zipPath)  { Remove-Item $zipPath  -Force }

# ------------------- 4ï¸âƒ£  Export des tables brutes -------------------
$rawTables = @{
    "Invoices"    = "SELECT * FROM invoices"
    "Materials"   = "SELECT * FROM materials"
    "SalesOrders" = "SELECT * FROM sales_orders"
    "Employees"   = "SELECT * FROM employees"
}
foreach ($name in $rawTables.Keys) {
    $dt = Get-TableData -Sql $rawTables[$name]
    if ($dt) {
        $dt | Export-Excel -Path $excelPath -WorksheetName $name `
            -TableName $name -AutoSize -TableStyle Medium2 -PassThru | Out-Null
    }
}

# ------------------- 5ï¸âƒ£  Feuille ParamÃ¨tres -------------------
$paramData = @(
    @{ Param = "StartDate";      Value = (Get-Date).AddMonths(-12).ToString('yyyy-MM-dd') }
    @{ Param = "EndDate";        Value = (Get-Date).ToString('yyyy-MM-dd') }
    @{ Param = "Currency";       Value = "EUR" }
    @{ Param = "TargetRevenue";  Value = 5000000 }
)
$paramData | Export-Excel -Path $excelPath -WorksheetName "Parameters" `
    -TableName "Parameters" -AutoSize -TableStyle Light1 -PassThru | Out-Null

# ------------------- 6ï¸âƒ£  Feuille KPI (formules) -------------------
$kpiData = @(
    @{ KPI = "Total Invoices";            Formula = "=SUM(Invoices!B2:B1048576)" }
    @{ KPI = "Materials Weighted Sum";    Formula = "=SUMPRODUCT(Materials!C2:C1048576,Materials!D2:D1048576)" }
    @{ KPI = "Employees Count";           Formula = "=COUNTA(Employees!A2:A1048576)" }
    @{ KPI = "Revenue Growth %";          Formula = "=IF(Formulas!B1=0,0,(Formulas!B3/Formulas!B1-1))*100" }
    @{ KPI = "Profit Margin %";           Formula = "=IF(Formulas!B1=0,0,(Formulas!B4/Formulas!B1))*100" }
)
$kpiData | Export-Excel -Path $excelPath -WorksheetName "KPIs" `
    -TableName "KPIs" -AutoSize -TableStyle Medium6 -PassThru | Out-Null

# ------------------- 7ï¸âƒ£  BibliothÃ¨que de formules -------------------
$formules = @(
    @{ Desc = "Total Invoices";            Formula = "=SUM(Invoices!B2:B1048576)" }
    @{ Desc = "Materials Weighted Sum";    Formula = "=SUMPRODUCT(Materials!C2:C1048576,Materials!D2:D1048576)" }
    @{ Desc = "Employees Count";           Formula = "=COUNTA(Employees!A2:A1048576)" }
    @{ Desc = "Revenue Growth %";          Formula = "=IF(B1=0,0,(B3/B1-1))*100" }
    @{ Desc = "Profit Margin %";           Formula = "=IF(B1=0,0,(B4/B1))*100" }
)
$formules | Export-Excel -Path $excelPath -WorksheetName "Formules" `
    -TableName "Formules" -AutoSize -TableStyle Light2 -PassThru | Out-Null

# ------------------- 8ï¸âƒ£  Feuille Dashboard (pivots & graphiques) -------------------
$dashWs = "Dashboard"

# 8.1  Revenu mensuel (ligne)
$revPivot = New-ExcelPivotTableDefinition `
    -PivotTableName "RevenueByMonth" `
    -SourceWorksheet "Invoices" `
    -SourceRange "A1:Z1048576" `
    -Rows @("InvoiceDate") `
    -Values @("Amount") `
    -ValueFieldSettings @(@{ Name="Somme du montant"; Function="Sum" })
$revPivot | Export-Excel -Path $excelPath -WorksheetName $dashWs -PivotTableDefinition $revPivot -PassThru | Out-Null

$revChart = New-ExcelChartDefinition `
    -ChartType Line `
    -Title "Revenu mensuel" `
    -XRange "RevenueByMonth!A2:A100" `
    -YRange "RevenueByMonth!B2:B100"
$revChart | Export-Excel -Path $excelPath -WorksheetName $dashWs -ChartDefinition $revChart -PassThru | Out-Null

# 8.2  CoÃ»t par dÃ©partement (barres)
$deptPivot = New-ExcelPivotTableDefinition `
    -PivotTableName "DeptCost" `
    -SourceWorksheet "Invoices" `
    -SourceRange "A1:Z1048576" `
    -Rows @("Department") `
    -Values @("Amount") `
    -ValueFieldSettings @(@{ Name="Somme du montant"; Function="Sum" })
$deptPivot | Export-Excel -Path $excelPath -WorksheetName $dashWs -PivotTableDefinition $deptPivot -PassThru | Out-Null

$deptChart = New-ExcelChartDefinition `
    -ChartType BarClustered `
    -Title "CoÃ»t par DÃ©partement" `
    -XRange "DeptCost!A2:A100" `
    -YRange "DeptCost!B2:B100"
$deptChart | Export-Excel -Path $excelPath -WorksheetName $dashWs -ChartDefinition $deptChart -PassThru | Out-Null

# 8.3  Marge mensuelle (ligne)
$marginPivot = New-ExcelPivotTableDefinition `
    -PivotTableName "MarginByMonth" `
    -SourceWorksheet "Invoices" `
    -SourceRange "A1:Z1048576" `
    -Rows @("InvoiceDate") `
    -Values @("Margin") `
    -ValueFieldSettings @(@{ Name="Somme de la marge"; Function="Sum" })
$marginPivot | Export-Excel -Path $excelPath -WorksheetName $dashWs -PivotTableDefinition $marginPivot -PassThru | Out-Null

$marginChart = New-ExcelChartDefinition `
    -ChartType Line `
    -Title "Marge mensuelle" `
    -XRange "MarginByMonth!A2:A100" `
    -YRange "MarginByMonth!B2:B100"
$marginChart | Export-Excel -Path $excelPath -WorksheetName $dashWs -ChartDefinition $marginChart -PassThru | Out-Null

# ------------------- 9ï¸âƒ£  Feuille DÃ©cisions (alertes automatiques) -------------------
$decisionData = @(
    @{ Decision = "Alerteâ€‘Revenu";      Condition = "=IF(KPIs!B4<0.1,\"âš ï¸ Enâ€‘danger\",\"âœ… OK\")" }
    @{ Decision = "Alerteâ€‘Marge";       Condition = "=IF(KPIs!B5<15,\"âš ï¸ Revoir coÃ»ts\",\"âœ… OK\")" }
)
$decisionData | Export-Excel -Path $excelPath -WorksheetName "Decisions" `
    -TableName "Decisions" -AutoSize -TableStyle Yellow2 -PassThru | Out-Null

# ------------------- ðŸ”Ÿ   Compression ZIP -------------------
Compress-Archive -Path $excelPath -DestinationPath $zipPath -Force

# ------------------- ðŸ“§   Envoi du mail avec piÃ¨ce jointe -------------------
# Prompt for recipient email addresses
$recipientsInput = Read-Host "Entrez les adresses eâ€‘mail sÃ©parÃ©es par des pointsâ€‘virgules"
$mailTo = $recipientsInput -split ';' | ForEach-Object { $_.Trim() } -join ', '
$securePass = ConvertTo-SecureString $smtpPass -AsPlainText -Force
$cred       = New-Object System.Management.Automation.PSCredential($smtpUser,$securePass)

Send-MailMessage `
    -From          $mailFrom `
    -To            $mailTo `
    -Subject       $mailSubject `
    -Body          $mailBody `
    -SmtpServer    $smtpServer `
    -Port          $smtpPort `
    -UseSsl `
    -Credential    $cred `
    -Attachments   $zipPath

Write-Host "`nâœ…  Tableau de bord crÃ©Ã© â†’ $excelPath"
Write-Host "ðŸ“¦  Archive ZIP â†’ $zipPath"
Write-Host "âœ‰ï¸  Mail envoyÃ© Ã  $mailTo"
