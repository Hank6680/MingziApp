$ErrorActionPreference = "Stop"
Write-Host "== MingziApp clean verify =="
Set-Location $PSScriptRoot\..
if (Test-Path "node_modules") {
  Write-Host "Removing node_modules..."
  Remove-Item "node_modules" -Recurse -Force
}
if (Test-Path "package-lock.json") {
  Write-Host "Removing package-lock.json..."
  Remove-Item "package-lock.json" -Force
}
Write-Host "npm install..."
npm install
Write-Host "npm run dev..."
npm run dev
