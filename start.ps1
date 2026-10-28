Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "Starting FINN: Financial Investment Intelligence Agent" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan
Set-Location -Path $PSScriptRoot
python run_finn.py
