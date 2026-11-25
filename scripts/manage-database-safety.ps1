<#
.SYNOPSIS
  Outil officiel de Sauvegarde & Restauration de Sécurité (Automatisée) pour SAFE ERP
  Garantit l'intégrité de la base de données métier SQLite (data.db) et de son historique de migrations.
#>

param(
  [ValidateSet('backup', 'restore', 'verify')]
  [string]$Action = 'backup',
  [string]$BackupFile = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot

$dataDb = Join-Path $projectRoot "src\data\data.db"
$backupDir = Join-Path $projectRoot "backups"

if (-not (Test-Path $backupDir)) {
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

switch ($Action) {
  'backup' {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $target = Join-Path $backupDir "safe_backup_${timestamp}.db"
    Copy-Item -LiteralPath $dataDb -Destination $target -Force
    $sizeMB = [math]::Round((Get-Item $target).Length / 1MB, 2)
    Write-Host "✅ Sauvegarde sécurisée créée : $target ($sizeMB MB)" -ForegroundColor Green
  }
  'verify' {
    if (-not (Test-Path $dataDb)) {
      throw "Base de données introuvable : $dataDb"
    }
    $sizeMB = [math]::Round((Get-Item $dataDb).Length / 1MB, 2)
    Write-Host "✅ Base de données présente et accessible ($sizeMB MB)." -ForegroundColor Green
    Write-Host "Contrôle de conformité de l'historique Prisma..." -ForegroundColor Gray
    npx prisma migrate status --schema=src/data/prisma/schema.prisma
  }
  'restore' {
    if (-not $BackupFile -or -not (Test-Path $BackupFile)) {
      throw "Fichier de sauvegarde invalide ou non spécifié."
    }
    Copy-Item -LiteralPath $BackupFile -Destination $dataDb -Force
    Write-Host "✅ Base de données restaurée avec succès depuis : $BackupFile" -ForegroundColor Green
  }
}
