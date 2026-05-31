$modelsPath = "$PSScriptRoot\assets\models"
$ErrorActionPreference = "Continue"

if (-not (Test-Path $modelsPath)) {
    New-Item -ItemType Directory -Path $modelsPath -Force | Out-Null
}

Write-Host "`n========================================`n"
Write-Host "NHAI Facial Recognition - Model Downloader`n"
Write-Host "========================================`n"

$blazefaceUrl = "https://github.com/google/mediapipe/raw/master/mediapipe/models/face_detection_short_range.tflite"
$mobilefacenetUrl = "https://github.com/peter-mwangi/Face-recognition-with-Python-and-Tensorflow/raw/master/models/mobilefacenet_int8.tflite"

$models = @()
$models += @{ name = "blazeface.tflite"; url = $blazefaceUrl; size = "320 KB"; purpose = "Face Detection" }
$models += @{ name = "mobilefacenet_int8.tflite"; url = $mobilefacenetUrl; size = "3.5 MB"; purpose = "Face Embeddings" }

$successCount = 0
$failCount = 0

foreach ($model in $models) {
    $modelPath = "$modelsPath\$($model.name)"
    Write-Host "Downloading: $($model.name)" -ForegroundColor Cyan
    Write-Host "Purpose: $($model.purpose) | Size: $($model.size)"
    
    try {
        $ProgressPreference = "SilentlyContinue"
        Invoke-WebRequest -Uri $model.url -OutFile $modelPath -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        
        if (Test-Path $modelPath) {
            $size = (Get-Item $modelPath).Length
            $sizeKB = [math]::Round($size / 1KB, 2)
            Write-Host "OK - Downloaded ($sizeKB KB)`n" -ForegroundColor Green
            $successCount++
        }
    }
    catch {
        Write-Host "FAILED - Manual download required`n" -ForegroundColor Red
        Write-Host "URL: $($model.url)`n" -ForegroundColor Gray
        $failCount++
    }
}

Write-Host "`n========================================`n" -ForegroundColor Cyan
Write-Host "Summary:`n"

$count = 0
foreach ($model in $models) {
    $modelPath = "$modelsPath\$($model.name)"
    if (Test-Path $modelPath) {
        $size = (Get-Item $modelPath).Length
        $sizeKB = [math]::Round($size / 1KB, 2)
        Write-Host "  [OK]  $($model.name) ($sizeKB KB)" -ForegroundColor Green
        $count++
    }
    else {
        Write-Host "  [MISSING] $($model.name)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Downloaded: $count / $($models.Count) models"
Write-Host "Location: $modelsPath"
Write-Host "`n========================================`n"
