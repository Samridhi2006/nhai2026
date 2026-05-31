# Manual Model Download Guide

## Download Status
- ❌ Automated downloading via Python/curl failed  
- ✅ Internet connectivity is working
- **Solution**: Manually download the models

---

## Model 1: BlazeFace (Face Detection)

**File:** `blazeface.tflite`  
**Size:** ~320 KB  
**Purpose:** Real-time face detection

### Download Options:

**Option A - Google MediaPipe (RECOMMENDED)**
1. Visit: https://github.com/google/mediapipe/releases
2. Find the latest release (v0.9.0 or newer)
3. Look in the releases for model files
4. Download `face_detection_short_range.tflite` or similar

**Option B - TensorFlow Model Hub**
1. Visit: https://tfhub.dev
2. Search for "face detection"
3. Filter for TFLite format (.tflite)
4. Download the model
5. Rename to `blazeface.tflite`

**Option C - Direct Sources**
- MediaPipe Models: https://github.com/google/mediapipe/tree/master/mediapipe/models
- Look for: `face_detection*.tflite`

---

## Model 2: MobileFaceNet (Face Embeddings)

**File:** `mobilefacenet_int8.tflite`  
**Size:** ~3.5 MB  
**Purpose:** Generate face embeddings for recognition

### Download Options:

**Option A - GitHub Release (RECOMMENDED)**
1. Visit: https://github.com/peter-mwangi/Face-recognition-with-Python-and-Tensorflow
2. Go to "Releases" tab
3. Find "v1.0" release
4. Download `mobilefacenet_int8.tflite`

**Option B - TensorFlow Hub**
1. Go to: https://tfhub.dev
2. Search for "mobilefacenet" or "face recognition"
3. Download TFLite format model
4. Rename to `mobilefacenet_int8.tflite`

**Option C - Alternative MobileNet Models**
- If MobileFaceNet unavailable, any MobileNet v2/v3 INT8 model works
- Download from: https://github.com/tensorflow/models/tree/master/research/object_detection

---

## Model 3: Blink Detector (Liveness Detection) - OPTIONAL

**File:** `blink_detector.tflite`  
**Size:** ~500 KB  
**Purpose:** Detect eye blinks for liveness verification (optional for Phase 1)

### Download Options:

**Option A - Eye Detection Model (RECOMMENDED)**
1. Visit: https://github.com/terryky/tflite_eye_detection/releases
2. Download: `eye_detection_model.tflite` or similar
3. Rename to `blink_detector.tflite`

**Option B - Alternative Eye Detection**
1. Visit: https://github.com/schavesgm/eye-detection-tflite
2. Go to Releases
3. Download the `.tflite` file
4. Rename to `blink_detector.tflite`

**Option C - Use Any Small Model (Placeholder)**
- For Phase 1 testing, you can use ANY small TFLite model (~500 KB)
- The app structure will validate without needing specific functionality
- Example: Download mobilenet_v2_1.0_224_quant.tflite and rename it

---

## Installation Steps

### 1. Create Models Directory (if not exists)
```
src/assets/models/
```

### 2. Download the three files

### 3. Place Files
Download the models and place them in: `src/assets/models/`

```
your-project/
├── src/
│   ├── assets/
│   │   └── models/
│   │       ├── blazeface.tflite ✓
│   │       ├── mobilefacenet_int8.tflite ✓
│   │       └── blink_detector.tflite ✓
```

### 4. Verify Sizes
```bash
# On Windows PowerShell
Get-ChildItem src/assets/models/*.tflite | Format-Table Name, @{Name="SizeKB";Expression={[math]::Round($_.Length/1KB,2)}}

# Should show roughly:
# blazeface.tflite              300-400 KB
# mobilefacenet_int8.tflite   3000-3500 KB
# blink_detector.tflite        400-700 KB
```

---

## Quick Download Links (Verify These Are Current)

### Direct Raw Downloads (Test if these work):
```
BlazeFace:
https://storage.googleapis.com/mediapipe-models/face_detector/...
(Check MediaPipe releases page for current path)

MobileFaceNet:
https://github.com/peter-mwangi/Face-recognition-with-Python-and-Tensorflow/releases/download/v1.0/mobilefacenet_int8.tflite

Eye Detection:
https://github.com/terryky/tflite_eye_detection/releases/download/v0.0.1/eye_detection_model.tflite
```

---

## If You Still Can't Find Models

### Option 1: Use Pre-trained TensorFlow Models
Download from TensorFlow Model Zoo:
- https://github.com/tensorflow/models/tree/master/research/object_detection
- Download any object detection TFLite model
- Use for all three placeholders during development
- Replace with proper models before production

### Option 2: Contact Repository Maintainers
- Issues on GitHub repos often have download links
- Example: https://github.com/google/mediapipe/issues

### Option 3: Use Placeholder Models
For development/testing only:
```bash
# Use this in place while fixing downloads
python create-placeholder-models.py
```
(These won't work for actual inference but allow app testing)

---

## Next Steps After Download

1. **Verify files exist:**
   ```bash
   cd src/assets/models/
   Get-ChildItem
   ```

2. **Check app can find them:**
   ```bash
   npm start
   ```

3. **Test initialization:**
   - App should load without "model not found" errors
   - Check console for: "✓ Models loaded successfully"

4. **Run on device:**
   ```bash
   npm run android
   # or
   npm run ios
   ```

---

## Troubleshooting

### File Too Small (< 50 KB)
- Downloaded HTML error page, not model
- Try different source
- Check URL is correct

### File Download Fails (403/404)
- Link is broken or removed
- Try alternative link from different source
- Check if repository was archived

### Wrong Model Type
- Verify it's a `.tflite` file, not `.pb` or `.h5`
- TFLite models are binary files, not text
- Size should be reasonable (>100 KB for useful models)

---

## Model File Verification

Once downloaded, you can verify they're valid TFLite files:

```bash
# Check file signature - should start with "TFL3"
file blazeface.tflite

# Or in PowerShell:
[System.IO.File]::ReadAllBytes("blazeface.tflite") | Select-Object -First 4 | ForEach-Object { Write-Host $_ }
# Should show: 84 70 76 51 (which is "TFL3" in ASCII)
```

---

## Summary

| Model | File | Size | Status |
|-------|------|------|--------|
| Face Detection | blazeface.tflite | 320 KB | Download from [GitHub/MediaPipe](https://github.com/google/mediapipe/releases) |
| Face Embeddings | mobilefacenet_int8.tflite | 3.5 MB | Download from [GitHub Release](https://github.com/peter-mwangi/Face-recognition-with-Python-and-Tensorflow/releases) |
| Liveness | blink_detector.tflite | 500 KB | Download from [GitHub Release](https://github.com/terryky/tflite_eye_detection/releases) or use substitute |

**All manual downloads:** Place in `src/assets/models/` and verify file sizes.
