@echo off
REM Download TensorFlow Lite models for NHAI
REM Models directory
set MODELS_DIR=src\assets\models
if not exist "%MODELS_DIR%" mkdir "%MODELS_DIR%"

echo.
echo ============================================================
echo NHAI Facial Recognition - Model Downloader
echo ============================================================
echo.

REM Check if curl is available
where curl >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Using curl for downloads...
    goto :use_curl
) else (
    echo curl not found, trying powershell...
    goto :use_powershell
)

:use_curl
echo.
echo Downloading: blazeface.tflite
curl -L -o "%MODELS_DIR%\blazeface.tflite" "https://github.com/google/mediapipe/raw/master/mediapipe/models/face_detection_short_range.tflite" --connect-timeout 30 2>nul
if exist "%MODELS_DIR%\blazeface.tflite" (
    for %%F in ("%MODELS_DIR%\blazeface.tflite") do (
        set size=%%~zF
        if !size! GTR 50000 (
            echo OK - Downloaded !size! bytes
        ) else (
            echo FAILED - file too small (!size! bytes). Trying alternate source...
            del "%MODELS_DIR%\blazeface.tflite"
            curl -L -o "%MODELS_DIR%\blazeface.tflite" "https://raw.githubusercontent.com/google/mediapipe/master/mediapipe/models/face_detection_short_range.tflite" --connect-timeout 30 2>nul
            for %%G in ("%MODELS_DIR%\blazeface.tflite") do echo OK - Downloaded %%~zG bytes
        )
    )
) else (
    echo FAILED
)

echo.
echo Downloading: mobilefacenet_int8.tflite
curl -L -o "%MODELS_DIR%\mobilefacenet_int8.tflite" "https://github.com/peter-mwangi/Face-recognition-with-Python-and-Tensorflow/releases/download/v1.0/mobilefacenet_int8.tflite" 2>nul
if exist "%MODELS_DIR%\mobilefacenet_int8.tflite" (
    for %%F in ("%MODELS_DIR%\mobilefacenet_int8.tflite") do echo OK - Downloaded %%~zF bytes
) else (
    echo FAILED - trying alternate source...
    curl -L -o "%MODELS_DIR%\mobilefacenet_int8.tflite" "https://raw.githubusercontent.com/peter-mwangi/Face-recognition-with-Python-and-Tensorflow/master/models/mobilefacenet_int8.tflite" 2>nul
    if exist "%MODELS_DIR%\mobilefacenet_int8.tflite" (
        for %%F in ("%MODELS_DIR%\mobilefacenet_int8.tflite") do echo OK - Downloaded %%~zF bytes
    ) else (
        echo FAILED
    )
)

echo.
echo Downloading: blink_detector.tflite (optional)
curl -L -o "%MODELS_DIR%\blink_detector.tflite" "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float32/1/face_landmarker.tflite" 2>nul
if exist "%MODELS_DIR%\blink_detector.tflite" (
    for %%F in ("%MODELS_DIR%\blink_detector.tflite") do echo OK - Downloaded %%~zF bytes
) else (
    echo FAILED (optional)
)

goto :summary

:use_powershell
REM Fallback to PowerShell implementation
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$models = @{ ^
    'blazeface.tflite' = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float32/1/face_detection_short_range.tflite'; ^
    'mobilefacenet_int8.tflite' = 'https://github.com/peter-mwangi/Face-recognition-with-Python-and-Tensorflow/releases/download/v1.0/mobilefacenet_int8.tflite'; ^
    'blink_detector.tflite' = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float32/1/face_landmarker.tflite' ^
}; ^
foreach ($m in $models.GetEnumerator()) { ^
    Write-Host ''; ^
    Write-Host \"Downloading: $($m.Name)\"; ^
    $path = '%MODELS_DIR%\' + $m.Name; ^
    try { ^
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12; ^
        Invoke-WebRequest -Uri $m.Value -OutFile $path -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop; ^
        $size = (Get-Item $path).Length; ^
        Write-Host \"OK - Downloaded $size bytes\" -ForegroundColor Green ^
    } catch { ^
        Write-Host \"FAILED\" -ForegroundColor Red ^
    } ^
}"

:summary
echo.
echo ============================================================
echo Summary:
echo ============================================================
echo Models directory: %MODELS_DIR%
echo.
dir /s "%MODELS_DIR%\*.tflite" 2>nul
if ERRORLEVEL 1 (
    echo No models found.
)
echo.
echo ============================================================
