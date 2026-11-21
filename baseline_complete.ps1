# Set project root
Set-Location -Path "C:\Users\USER\AppData\Roaming\safe"

# Ensure migrations folder exists
$MigrationsDir = "src\\data\\prisma\\migrations"
if (-Not (Test-Path $MigrationsDir)) {
    New-Item -ItemType Directory -Path $MigrationsDir | Out-Null
}

# Path to Prisma schema (single backslashes for PowerShell)
$SchemaPath = "src\data\prisma\schema.prisma"

# Generate timestamp for migration folder
$Timestamp = Get-Date -Format "yyyyMMddHHmmss"
$FolderName = "${Timestamp}_baseline"
$FolderPath = Join-Path $MigrationsDir $FolderName

# Create migration folder
New-Item -ItemType Directory -Path $FolderPath | Out-Null

# Generate migration SQL diff (from empty schema to current schema)
# Using npx to invoke Prisma CLI
npx prisma migrate diff --from-empty --to-schema-datamodel=src\data\prisma\schema.prisma --script > "${FolderPath}\migration.sql"

# Verify migration folder content
Write-Output "Listing migration folder contents:"
Get-ChildItem "$FolderPath"

# Brief pause to let filesystem settle
Start-Sleep -Milliseconds 2000

# Mark the migration as applied
npx prisma migrate resolve --applied "${FolderName}" --schema="$SchemaPath"

# Show migration status
npx prisma migrate status --schema="$SchemaPath"
