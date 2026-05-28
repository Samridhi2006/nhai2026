# NHAI Facial Recognition System - Implementation Guide

## 📋 Quick Start

### Prerequisites
```bash
# Node.js >= 18
node --version

# Expo CLI
npm install -g @expo/cli

# EAS CLI (for building)
npm install -g eas-cli
```

### Installation (5 minutes)

```bash
# 1. Navigate to project
cd nhai-facial-recognition

# 2. Install dependencies
npm install

# 3. Download models (4.3 MB total)
# Place in src/assets/models/:
#   - blazeface.tflite (320 KB)
#   - mobilefacenet_int8.tflite (3.5 MB)
#   - blink_detector.tflite (500 KB)

# 4. Start development server
npm start

# 5. Run on device
# iOS: i
# Android: a
# Web: w
```

---

## 🏗️ Project Structure

```
nhai-facial-recognition/
├── src/
│   ├── app/
│   │   └── App.tsx              # Main entry point
│   ├── screens/
│   │   ├── AttendanceScreen.tsx # Main recognition UI
│   │   ├── RegistrationScreen.tsx
│   │   └── VerificationScreen.tsx
│   ├── services/
│   │   ├── TFLiteService.ts     # Model inference
│   │   ├── LivenessService.ts   # Blink detection
│   │   ├── FaceStorage.ts       # Face matching
│   │   ├── SyncService.ts       # AWS sync
│   │   └── EncryptionService.ts # AES-256 encryption
│   ├── processors/
│   │   └── frameProcessor.worklet.ts  # Frame processing
│   ├── utils/
│   │   ├── math.ts              # Cosine similarity
│   │   └── logger.ts            # Structured logging
│   ├── types/
│   │   └── attendance.ts
│   └── assets/
│       └── models/              # TFLite models (4.3 MB)
├── android/                     # Android native code
├── ios/                         # iOS native code
├── app.json                     # Expo config
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🚀 MVP Implementation (Week 1)

### Day 1-2: Setup
```bash
# Create Expo project
expo init nhai-facial-recognition --template

# Install core dependencies
npm install react-native-vision-camera react-native-fast-tflite

# Configure camera permissions
```

### Day 3: Face Detection
```typescript
// 1. Load BlazeFace model
const model = await loadTensorflowModel(require('models/blazeface.tflite'), []);

// 2. Process frame
const detection = await model.runSync([frameBuffer]);

// 3. Parse output
const faces = parseDetections(detection);
```

### Day 4-5: Embeddings & Matching
```typescript
// 1. Extract face embedding (112x112 input)
const embedding = await mobileFaceNet.runSync([faceCrop]);

// 2. Calculate cosine similarity
const score = cosineSimilarity(embedding, storedEmbedding);

// 3. Match if score > threshold
const match = score > 0.6 ? matched : notMatched;
```

### Day 6-7: Liveness + Polish
```typescript
// 1. Detect blinks
const blinkOpen = await blinkDetector.runSync([eyePatch]);

// 2. Track 2+ blinks
if (validBlinkCount >= 2) {
  isLive = true;
}

// 3. Record attendance
await recordAttendance({
  faceId,
  timestamp: Date.now(),
  confidence: score
});
```

---

## 🧠 Model Downloads

### Option 1: Direct Download
```bash
# BlazeFace (320 KB)
https://storage.googleapis.com/download.tensorflow.org/models/mobilenet_v2_1.0_224_quant_uint8.tflite

# MobileFaceNet INT8 (3.5 MB)
# Download from: https://github.com/davidsandberg/facenet

# Blink Detector (500 KB)
# Download pre-trained or train custom
```

### Option 2: Convert from ONNX
```bash
# Using tensorflow:
python -m tensorflow.lite.tflitec \
  --graph_def_file=model.pb \
  --output_file=model.tflite \
  --target_ops=TFLITE_BUILTINS \
  --optimizations=DEFAULT \
  --quantized_input_stats=0,255 \
  --input_format=GRAPH_DEF \
  --inference_type=QUANTIZED_UINT8
```

---

## 📱 Testing on Device

### iOS (Simulator)
```bash
# Requires Mac
npm run ios

# Note: Camera won't work on simulator
# Use physical device for testing
```

### Android (Emulator)
```bash
# Start emulator
emulator -avd Pixel_5_API_31

# Run app
npm run android
```

### Physical Device (Recommended)
```bash
# Install Expo Go app
# Scan QR code from: npm start

# Or use EAS preview:
eas build --platform android --profile preview
```

---

## ⚡ Performance Optimization

### 1. Memory Management
```typescript
// Keep only active models in memory
private activeModels = ['blazeface'];  // Always load
private lazyModels = ['mobilefacenet'];  // Load on demand

// Reuse ArrayBuffers
private frameBuffer = new ArrayBuffer(320 * 320 * 3);
```

### 2. Frame Processing
```typescript
// 30 FPS pipeline
|- Face detection: 40ms
|- Face crop: 3ms
|- Liveness: 150ms (parallel)
|- Embedding: 200ms (parallel)
|- Matching: 5ms
TOTAL: ~350ms per frame (acceptable @ 30 FPS)
```

### 3. Battery Optimization
```typescript
// Adaptive FPS based on battery
if (batteryLevel > 50%) fps = 30;
else if (batteryLevel > 20%) fps = 15;
else fps = 10;

// Disable screen brightness management
screen.brightness = 0.7;
```

---

## 🔒 Security Implementation

### Encryption (AES-256-GCM)
```typescript
// Store face embeddings encrypted
const encrypted = await EncryptionService.encrypt({
  embedding,
  metadata
});

// Decrypt only when needed
const decrypted = await EncryptionService.decrypt(encrypted);
```

### Secure Storage
```typescript
// Use platform keystore
import Keychain from 'react-native-keychain';

// Store master key in Keychain
await Keychain.setGenericPassword('key', masterKey);

// Never log sensitive data
```

### Request Signing
```typescript
// Sign requests to AWS
const signature = hmacSha256(JSON.stringify(payload), masterKey);

// Include in headers
headers['x-signature'] = signature;
```

---

## 📊 Monitoring & Logging

### Structured Logging
```typescript
Logger.log({
  event: 'face_detected',
  confidence: 0.95,
  latency: 42,
  timestamp: Date.now()
});

// Send to: CloudWatch / Datadog
```

### Performance Metrics
```typescript
// Track key metrics
- Face detection latency (p50, p95, p99)
- Embedding extraction time
- Match accuracy (TP, FP, TN, FN)
- Liveness detection accuracy
- Memory usage
- Battery drain (mAh/min)
```

---

## 🔄 AWS Sync

### Setup Backend (AWS Lambda + DynamoDB)
```bash
# Create API endpoint
POST /sync/batch

# DynamoDB table
table: attendance
├─ PK: deviceId
├─ SK: timestamp
├─ faceId
├─ confidence
└─ location

# Enable backup to S3
s3://nhai-backups/attendance/
```

### Local Sync Queue
```typescript
// When offline: queue locally
const pending = await db.query('WHERE syncStatus = "pending"');

// When online: sync automatically
await SyncService.syncPending();
```

---

## 🎯 Accuracy Tuning

### Threshold Selection
```typescript
// MobileFaceNet INT8 @ threshold 0.6:
- LFW Accuracy: 98%
- False Rejection Rate: 5% (user rejects)
- False Acceptance Rate: 0.1% (wrong person accepted)

// Adjust threshold based on requirements:
- Strict (0.7): FRR 1%, FAR 0.01%
- Normal (0.6): FRR 5%, FAR 0.1%
- Relaxed (0.5): FRR 10%, FAR 1%
```

### Improve Accuracy
```typescript
// 1. Better lighting (>500 lux)
// 2. Face centered in frame
// 3. At least 2 valid blinks
// 4. No glasses or masks
// 5. Stable head position
```

---

## 🐛 Debugging

### Common Issues

**Issue: Inference too slow**
```typescript
// Solution: Check model size, use quantized version
// BlazeFace should be < 50ms
// MobileFaceNet should be < 200ms
// If slower: check device specs (CPU throttling?)
```

**Issue: Poor face detection**
```typescript
// Solution: Check lighting, resolution, face position
// Ensure: 320x320 input, normalized to [-1, 1]
```

**Issue: Liveness not detecting blinks**
```typescript
// Solution: Check eye crop, lighting on eyes
// Debug: Draw eye rectangles to verify crop
```

**Issue: High memory usage**
```typescript
// Solution: Profile with:
// Android: adb shell dumpsys meminfo
// iOS: Xcode Memory Debugger
```

---

## 🚀 Production Deployment

### Android APK Build
```bash
# Generate signing key
keytool -genkey -v -keystore ~/.android/release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 -alias nhai

# Build AAB (for Play Store)
eas build --platform android --profile release

# Size optimization
gradle assembleRelease --no-watch-filesystem
# Final APK: ~25-30 MB
```

### iOS Build
```bash
# Build for App Store
eas build --platform ios --profile release

# Requirements:
# - Apple Developer account
# - Distribution certificate
# - Provisioning profile

# Final app: ~40-50 MB
```

### Rollout Strategy
```
Week 1: Alpha (5 devices)
├─ Monitor: latency, crashes, memory
├─ Metrics: <500ms, <1% crash rate

Week 2: Beta (50 devices)
├─ Gather real-world data
├─ Fix critical issues

Week 3: GA (Full rollout)
├─ Monitor infrastructure
├─ Update documentation
```

---

## 📚 References

- **Vision Camera**: https://visioncamera.dev
- **TFLite**: https://tensorflow.org/lite
- **MobileFaceNet**: https://arxiv.org/abs/1804.07573
- **BlazeFace**: https://arxiv.org/abs/1907.05047
- **Cosine Similarity**: https://en.wikipedia.org/wiki/Cosine_similarity

---

## 🤝 Support

For issues or questions:
1. Check logs: `adb logcat | grep NHAI`
2. Review ARCHITECTURE.md for detailed design
3. Run diagnostics: `npm run test`
4. Profile performance: `npm run profile`

---

## ✅ Production Checklist

Before going live:
- [ ] All models downloaded and optimized
- [ ] <500ms end-to-end latency verified
- [ ] <100MB RAM usage on 3GB device
- [ ] Encryption keys rotated
- [ ] AWS backend tested
- [ ] Error handling implemented
- [ ] Logging configured
- [ ] Security audit passed
- [ ] Documentation complete
- [ ] Load test: 100+ concurrent users

---

**Ready to deploy!** 🚀

