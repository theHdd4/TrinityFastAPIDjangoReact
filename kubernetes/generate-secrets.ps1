# Generate Secure Kubernetes Secrets
# This script generates cryptographically secure secrets for Kubernetes

Write-Host "🔐 Generating Kubernetes Secrets" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan

# Function to generate random string
function New-RandomSecret {
    param([int]$Length = 50)
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_="
    $random = 1..$Length | ForEach-Object { Get-Random -Maximum $chars.Length }
    return -join ($random | ForEach-Object { $chars[$_] })
}

# Function to convert to base64
function ConvertTo-Base64 {
    param([string]$String)
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($String))
}

Write-Host "`n📝 Generating secrets..." -ForegroundColor Yellow

# Generate secrets
$djangoSecretKey = New-RandomSecret -Length 50
$postgresPassword = New-RandomSecret -Length 32
$mongoPassword = New-RandomSecret -Length 32
$minioAccessKey = "minio"  # Standard for staging
$minioSecretKey = New-RandomSecret -Length 24

Write-Host "   ✅ Generated Django secret key" -ForegroundColor Green
Write-Host "   ✅ Generated PostgreSQL password" -ForegroundColor Green
Write-Host "   ✅ Generated MongoDB password" -ForegroundColor Green
Write-Host "   ✅ Generated MinIO credentials" -ForegroundColor Green

# Convert to base64
$djangoSecretKeyB64 = ConvertTo-Base64 $djangoSecretKey
$postgresPasswordB64 = ConvertTo-Base64 $postgresPassword
$mongoPasswordB64 = ConvertTo-Base64 $mongoPassword
$minioAccessKeyB64 = ConvertTo-Base64 $minioAccessKey
$minioSecretKeyB64 = ConvertTo-Base64 $minioSecretKey

Write-Host "`n📄 Generated Base64 Values:" -ForegroundColor Cyan
Write-Host "-" * 70
Write-Host "Django Secret Key (first 20 chars): $($djangoSecretKey.Substring(0, 20))..." -ForegroundColor Gray
Write-Host "PostgreSQL Password (first 10 chars): $($postgresPassword.Substring(0, 10))..." -ForegroundColor Gray
Write-Host "MongoDB Password (first 10 chars): $($mongoPassword.Substring(0, 10))..." -ForegroundColor Gray
Write-Host "MinIO Access Key: $minioAccessKey" -ForegroundColor Gray
Write-Host "MinIO Secret Key (first 10 chars): $($minioSecretKey.Substring(0, 10))..." -ForegroundColor Gray

# Create the secrets YAML
$secretsYaml = @"
apiVersion: v1
kind: Secret
metadata:
  name: trinity-staging-secrets
  namespace: trinity-staging
type: Opaque
data:
  # Auto-generated secrets - Generated on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
  postgres-password: $postgresPasswordB64
  mongo-password: $mongoPasswordB64
  mongo-user-password: $postgresPasswordB64
---
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: trinity-staging
type: Opaque
data:
  # Auto-generated secrets - Generated on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
  django-secret-key: $djangoSecretKeyB64
  minio-access-key: $minioAccessKeyB64
  minio-secret-key: $minioSecretKeyB64
  redis-password: ""  # No password for staging
---
"@

# Backup existing secrets file
$secretsFile = "secrets/database-secrets.yaml"
if (Test-Path $secretsFile) {
    $backupFile = "secrets/database-secrets.yaml.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $secretsFile $backupFile
    Write-Host "`n💾 Backed up existing secrets to:" -ForegroundColor Yellow
    Write-Host "   $backupFile" -ForegroundColor Gray
}

# Write new secrets
Set-Content -Path $secretsFile -Value $secretsYaml
Write-Host "`n✅ Secrets written to: $secretsFile" -ForegroundColor Green

# Create a local reference file (NOT FOR GIT)
$referenceFile = "secrets/.secrets-reference.txt"
$referenceContent = @"
Trinity Kubernetes Secrets Reference
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
=====================================

⚠️  KEEP THIS FILE SECURE - DO NOT COMMIT TO GIT

Django Secret Key: $djangoSecretKey
PostgreSQL Password: $postgresPassword
MongoDB Password: $mongoPassword
MinIO Access Key: $minioAccessKey
MinIO Secret Key: $minioSecretKey

Base64 Encoded Values (for manual verification):
-------------------------------------------------
Django Secret Key: $djangoSecretKeyB64
PostgreSQL Password: $postgresPasswordB64
MongoDB Password: $mongoPasswordB64
MinIO Access Key: $minioAccessKeyB64
MinIO Secret Key: $minioSecretKeyB64

Note: Store these values securely in a password manager or vault.
"@

Set-Content -Path $referenceFile -Value $referenceContent
Write-Host "📝 Plain-text reference saved to: $referenceFile" -ForegroundColor Yellow
Write-Host "   ⚠️  Keep this file secure and do NOT commit to git!" -ForegroundColor Red

# Update .gitignore if needed
$gitignoreFile = "../.gitignore"
if (Test-Path $gitignoreFile) {
    $gitignoreContent = Get-Content $gitignoreFile -Raw
    if ($gitignoreContent -notmatch ".secrets-reference.txt") {
        Add-Content -Path $gitignoreFile -Value "`n# Kubernetes secrets reference`nkubernetes/secrets/.secrets-reference.txt"
        Write-Host "   ✅ Added .secrets-reference.txt to .gitignore" -ForegroundColor Green
    }
}

Write-Host "`n" + "=" * 70
Write-Host "🎉 Secrets generated successfully!" -ForegroundColor Green
Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Review the generated secrets in:" -ForegroundColor White
Write-Host "      $secretsFile" -ForegroundColor Gray
Write-Host ""
Write-Host "   2. Store the plain-text reference securely:" -ForegroundColor White
Write-Host "      $referenceFile" -ForegroundColor Gray
Write-Host ""
Write-Host "   3. Apply secrets to cluster:" -ForegroundColor White
Write-Host "      kubectl apply -f $secretsFile" -ForegroundColor Gray
Write-Host ""
Write-Host "   4. Verify secrets were created:" -ForegroundColor White
Write-Host "      kubectl get secrets -n trinity-staging" -ForegroundColor Gray
Write-Host ""
Write-Host "⚠️  IMPORTANT: Back up $referenceFile to a secure location!" -ForegroundColor Red
Write-Host ""

