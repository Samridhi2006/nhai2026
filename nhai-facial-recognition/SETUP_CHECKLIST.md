# NHAI Facial Recognition - Complete Fix Checklist

## ✅ COMPLETED: Code Changes

All critical code issues have been fixed:
- [x] package.json - updated all dependencies & versions
- [x] app.json - added Expo plugins (dev-client, vision-camera, fast-tflite)
- [x] metro.config.js - added .bin extension support
- [x] android/gradle.properties - created with Nitro config
- [x] TFLiteService.ts - fixed fast-tflite v3 API (ArrayBuffer handling)
- [x] EncryptionService.ts - replaced crypto-js with AES-256-GCM
- [x] frameProcessor.worklet.ts - created for real-time detection

---

## 🔴 IMMEDIATE ACTIONS (Do This First - To Fix QR Scan)

### Step 1: Clean and Reinstall Dependencies
```bash
cd c:\nhai\nhai-facial-recognition
npm install
# or
yarn install
```

### Step 2: Install EAS CLI (one-time)
```bash
npm install -g eas-cli
eas login
# Follow prompts to sign in with Expo account
```

### Step 3: Build Development APK
```bash
eas build --profile development --platform android
```
⏱️ **Expected time: 10-15 minutes**
- First build is slower
- Subsequent builds are faster

### Step 4: Install on Device
```bash
# Download the APK from EAS when build completes
# Then install on your Android device:
adb install path/to/app-release.apk

# Or manually transfer and open on device
```

### Step 5: Start Dev Server with Dev Client
```bash
npx expo start --dev-client
```

### Step 6: Scan QR Code
- **Use the custom dev APK** (NOT Expo Go)
- Scan the QR code from terminal
- App should now launch without crashing

---

## 🟡 THIS WEEK: Model Setup & Testing

### Step 7: Download TensorFlow Hub Models

**BlazeFace (Face Detection - 320 KB)**
```
Source: https://github.com/google/mediapipe/releases
File: blazeface.tflite
Destination: c:\nhai\nhai-facial-recognition\assets\models\
```

**MobileFaceNet (Face Embeddings - 3.5 MB)**
```
Source: https://github.com/peter-mwangi/Face-recognition-with-Python-and-Tensorflow
File: mobilefacenet_int8.tflite
Destination: c:\nhai\nhai-facial-recognition\assets\models\
```

**Blink Detector (Eye Closure - 500 KB)**
```
⚠️ NOT AVAILABLE PRE-TRAINED
Options:
  1. Use MediaPipe eye landmark model as proxy
  2. Train your own (need labeled eye images)
  3. Placeholder: create dummy model for Phase 1
Destination: c:\nhai\nhai-facial-recognition\assets\models\blink_detector.tflite
```

### Step 8: Verify Models Load
```bash
# In your test app, call:
npx expo start --dev-client

# Then manually test:
// In app code:
import { TFLiteService } from './src/services/TFLiteService';
await TFLiteService.initialize();
// Should log: ✓ All models loaded successfully
```

### Step 9: Test Frame Processor
Uncomment frame processor in your camera screen:
```typescript
import { frameProcessor, setFaceDetectionCallback } from '../processors/frameProcessor.worklet';

// In component:
setFaceDetectionCallback((detections, frameTime) => {
  console.log(`Detection: ${detections?.confidence || 0}, Time: ${frameTime}ms`);
});

// In VisionCamera:
<Camera
  frameProcessor={frameProcessor}
  {...otherProps}
/>
```

---

## 🟢 BEFORE PRODUCTION

### Step 10: Download & Install Models Properly
- Create `assets/models/` directory
- Download official models from:
  - BlazeFace: MediaPipe GitHub
  - MobileFaceNet: TensorFlow Hub
  - Blink Detector: Train or use eye landmark proxy

### Step 11: Test Encryption End-to-End
```typescript
import { EncryptionService } from './src/services/EncryptionService';

const enc = EncryptionService.getInstance();
await enc.initialize();

// Test encryption/decryption
const testData = { faceId: 'abc123', embedding: [1,2,3,...] };
const encrypted = await enc.encryptFaceData(testData);
const decrypted = await enc.decryptFaceData(encrypted);
console.log('✓ Encryption working:', JSON.stringify(decrypted) === JSON.stringify(testData));
```

### Step 12: Configure Secure Key Storage
```typescript
// In EncryptionService.ts, line 28:
// Replace: const password = 'NHAI-FACIAL-REC-KEY';
// With actual keychain retrieval:
import * as Keychain from 'react-native-keychain';

// Call once at app startup:
async setupSecureKey() {
  try {
    const credentials = await Keychain.getGenericPassword();
    if (!credentials) {
      // Generate and store key
      const randomKey = generateSecureKey();
      await Keychain.setGenericPassword('nhai-key', randomKey);
    }
  } catch (error) {
    console.error('Keychain error:', error);
  }
}
```

### Step 13: Add Liveness Detection (Phase 2)
```typescript
// In frameProcessor.worklet.ts, uncomment and implement:
frameProcessorWithLiveness = (frame: Frame) => {
  // 1. Detect face
  // 2. Extract eye patches
  // 3. Run blink detector
  // 4. Track head movement
  // 5. Combine scores
}
```

### Step 14: Test on Real Hardware
- Test on actual device (Pixel, Samsung, etc.)
- Verify frame rates (target: 30 FPS)
- Check battery usage
- Test in different lighting conditions
- Test camera permissions

### Step 15: Troubleshooting Guide

**If app crashes on startup:**
- Check logcat: `adb logcat -s "*java.lang.Exception*"`
- Verify model files exist in `assets/models/`
- Check Expo plugins are installed

**If QR scan doesn't work:**
- Ensure you're using dev APK, NOT Expo Go
- Restart dev server: `npx expo start --dev-client`

**If frame processor crashes:**
- Check byteOffset handling in frameProcessor.worklet.ts
- Verify vision-camera-resize-plugin is installed
- Check fast-tflite v3 model format

**If encryption fails:**
- Verify react-native-quick-crypto is installed
- Check key initialization
- Verify data format in encryptFaceData

---

## 📁 Expected Directory Structure After Model Setup

```
nhai-facial-recognition/
├── assets/
│   └── models/
│       ├── blazeface.tflite (320 KB)
│       ├── mobilefacenet_int8.tflite (3.5 MB)
│       └── blink_detector.tflite (500 KB)
├── android/
│   └── gradle.properties ✅ CREATED
├── src/
│   ├── processors/
│   │   └── frameProcessor.worklet.ts ✅ CREATED
│   └── services/
│       ├── TFLiteService.ts ✅ FIXED
│       └── EncryptionService.ts ✅ FIXED
├── app.json ✅ FIXED
├── metro.config.js ✅ FIXED
└── package.json ✅ FIXED
```

---

## 🎯 Success Criteria

- [ ] npm install completes without errors
- [ ] eas build succeeds
- [ ] Dev APK installs on device
- [ ] App launches with dev client (no Expo Go)
- [ ] Camera permission granted
- [ ] Models load: "✓ All models loaded successfully"
- [ ] Frame processor runs: detection logs appear
- [ ] Face detection works with >50% confidence
- [ ] Encryption test passes (encrypt/decrypt match)
- [ ] No crashes after 1 minute of camera use
- [ ] Frame rate ≥ 20 FPS

---

## 📞 Debugging Resources

**Documentation:**
- VisionCamera v5: https://react-native-vision-camera.com/
- fast-tflite v3 migration: [MIGRATION_V2_TO_V3.md](MIGRATION_V2_TO_V3.md)
- MediaPipe BlazeFace: https://github.com/google/mediapipe
- Expo Dev Client: https://docs.expo.dev/clients/introduction/

**Key Files to Reference:**
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design
- [src/services/TFLiteService.ts](src/services/TFLiteService.ts) - Model inference
- [src/processors/frameProcessor.worklet.ts](src/processors/frameProcessor.worklet.ts) - Real-time detection
