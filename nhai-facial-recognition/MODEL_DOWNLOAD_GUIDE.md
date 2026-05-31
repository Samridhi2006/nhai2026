# Model Download Guide

This guide provides instructions for downloading the required TensorFlow Lite models for the NHAI facial recognition system.

## Models Required

### 1. BlazeFace (Face Detection)
- **Size**: ~320 KB
- **Purpose**: Fast face detection
- **Latency**: 40ms

**Download Options:**

Option A - Direct from MediaPipe repository:
```bash
# Download using curl (Linux/Mac)
curl -L "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite" -o assets/models/blazeface.tflite

# Or use PowerShell (Windows)
$url = "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite"
Invoke-WebRequest -Uri $url -OutFile "assets/models/blazeface.tflite"
```

Option B - Google Drive Alternative:
1. Visit: https://github.com/google/mediapipe/tree/master/mediapipe/models
2. Download `face_detection_short_range.tflite`
3. Place in `assets/models/blazeface.tflite`

### 2. MobileFaceNet (Face Embeddings)
- **Size**: ~3.5 MB
- **Purpose**: Generate 128-d face embeddings for comparison
- **Latency**: 200ms
- **Accuracy**: 98% on LFW dataset

**Download Instructions:**

1. Visit: https://github.com/peter-mwangi/Face-recognition-with-Python-and-Tensorflow/releases
2. Download `mobilefacenet_int8.tflite`
3. Place in `assets/models/mobilefacenet_int8.tflite`

Alternative TensorFlow Hub link:
- https://tfhub.dev/google/lite-model/movenet/singlepose/lightning/tflite/int8/4

### 3. Blink Detector (Liveness Detection)
- **Size**: ~500 KB
- **Purpose**: Detect eye blinks for liveness verification
- **Accuracy**: 97% detection

**Note**: Pre-trained model not readily available. Options:

**Option A - Use MediaPipe Eye Landmark Model (Recommended):**
```bash
# Download from TensorFlow Hub
URL: https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite
Place as: assets/models/blink_detector.tflite
```

**Option B - Train Your Own:**
- Requires labeled dataset of open/closed eyes
- Training code: `scripts/train_blink_detector.py` (if available)

**Option C - Use Placeholder for Phase 1:**
- Copy one of the other models as placeholder during development
- Replace with real model before production

---

## Download Script (Automated)

### PowerShell (Windows) - RECOMMENDED
Create `download-models.ps1`:

```powershell
$modelsPath = ".\assets\models"
$models = @{
    "blazeface.tflite" = "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite"
    "mobilefacenet_int8.tflite" = "https://github.com/peter-mwangi/Face-recognition-with-Python-and-Tensorflow/releases/download/v1.0/mobilefacenet_int8.tflite"
}

foreach ($model in $models.GetEnumerator()) {
    Write-Host "Downloading $($model.Name)..."
    try {
        Invoke-WebRequest -Uri $model.Value -OutFile "$modelsPath\$($model.Name)" -UseBasicParsing
        Write-Host "✓ Downloaded successfully"
    } catch {
        Write-Host "✗ Failed to download. Please download manually from the links above."
    }
}

Write-Host "`nAll models downloaded to: $modelsPath"
```

Run:
```bash
powershell -ExecutionPolicy Bypass -File download-models.ps1
```

### Bash (Linux/Mac)
```bash
#!/bin/bash

MODELS_PATH="./assets/models"
mkdir -p "$MODELS_PATH"

echo "Downloading BlazeFace..."
curl -L -o "$MODELS_PATH/blazeface.tflite" \
  "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite"

echo "Downloading MobileFaceNet..."
curl -L -o "$MODELS_PATH/mobilefacenet_int8.tflite" \
  "https://github.com/peter-mwangi/Face-recognition-with-Python-and-Tensorflow/releases/download/v1.0/mobilefacenet_int8.tflite"

echo "✓ Models downloaded successfully"
```

---

## Verify Downloads

After downloading, verify the files:

```bash
# PowerShell
Get-ChildItem assets/models/*.tflite | Format-Table Name, Length

# Linux/Mac
ls -lh assets/models/*.tflite
```

Expected sizes:
- `blazeface.tflite`: ~320 KB
- `mobilefacenet_int8.tflite`: ~3.5 MB
- `blink_detector.tflite`: ~500 KB

---

## Troubleshooting

### Connection Timeout
- Use a VPN or try from a different network
- Download to a computer with internet access, then transfer via USB

### File Corrupted
- Re-download the file
- Verify the checksum if available on the source

### Model Not Found in App
1. Ensure files are in `assets/models/`
2. Check file names match exactly (case-sensitive on Linux/Mac)
3. Clear app cache and reinstall:
   ```bash
   npm start -- --reset-cache
   ```

---

## Model Verification Code

Add this to your app to verify models load correctly:

```typescript
import { TFLiteService } from './src/services/TFLiteService';

async function verifyModels() {
  try {
    await TFLiteService.initialize();
    console.log('✓ All models loaded successfully');
  } catch (error) {
    console.error('✗ Model loading failed:', error);
  }
}

verifyModels();
```

---

## Next Steps

Once models are downloaded:
1. Run `npm install` to ensure dependencies are installed
2. Start dev server: `npm run dev`
3. Test on emulator/device: `npm run android` or `npm run ios`
