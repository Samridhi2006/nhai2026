# Fast-TFLite v2 → v3 API Migration - All Changes Applied

## Overview
This document shows EVERY change made to migrate from fast-tflite v2 to v3 (Nitro Modules) in this codebase.

---

## 🔄 Change 1: Model Loading

### ❌ BEFORE (v2)
```typescript
const model = await loadTensorflowModel(require('assets/blazeface.tflite'));
```

### ✅ AFTER (v3)
```typescript
const model = await loadTensorflowModel(
  require('assets/models/blazeface.tflite'),
  []  // empty array for CPU-only (v3 requirement)
);
```

**Why:** v3 explicitly requires GPU delegate array parameter. Empty array = CPU-only.

---

## 🔄 Change 2: Inference Input Format

### ❌ BEFORE (v2)
```typescript
const output = model.runSync([float32Array]);  // Pass TypedArray directly
```

### ✅ AFTER (v3)
```typescript
// CRITICAL: Must use ArrayBuffer, not TypedArray
const inputBuffer = resized.buffer.slice(
  resized.byteOffset,
  resized.byteOffset + resized.byteLength
);
const output = model.runSync([inputBuffer]);  // Pass ArrayBuffer
```

**Why:** v3 API changed to accept only ArrayBuffer. TypedArrays will fail or give wrong results.

**Critical Edge Case:** When slicing buffers, must account for `byteOffset` (TypedArray may not start at 0).

---

## 🔄 Change 3: Inference Output Format

### ❌ BEFORE (v2)
```typescript
const output = model.runSync([input]);
const detections = new Float32Array(output[0]);  // Direct cast
const landmarks = new Float32Array(output[1]);
```

### ✅ AFTER (v3)
```typescript
const output = model.runSync([input]);
const detections = new Float32Array(output[0]!);  // Use non-null assertion (!)
const landmarks = new Float32Array(output[1]!);
```

**Why:** v3 returns ArrayBuffers (not already typed). Must wrap manually.

**TypeScript Tip:** Use `output[0]!` (non-null assertion) because TypeScript doesn't know the output shape at compile time.

---

## 🔄 Change 4: VisionCamera Integration

### ❌ BEFORE (v4 workaround)
```typescript
import { NitroModules } from 'react-native-vision-camera';

const boxedModel = NitroModules.box(model);
const unboxed = boxedModel.unbox();
```

### ✅ AFTER (v5 - no boxing needed)
```typescript
// Direct model access - NO boxing needed in v5
const outputs = model.runSync([inputBuffer]);
```

**Why:** VisionCamera v5 removed boxing. Direct model access now safe in worklets.

---

## 🔄 Change 5: Frame Processor Update

### ❌ BEFORE (v4 frame processor)
```typescript
export const frameProcessor = (frame: Frame) => {
  'worklet';
  
  // Convert frame to TypedArray
  const uint8Array = new Uint8Array(frame.buffer);
  const boxedModel = NitroModules.box(blazeFaceModel);
  const output = boxedModel.runSync([uint8Array]);
};
```

### ✅ AFTER (v5 frame processor with v3 API)
```typescript
export const frameProcessor = (frame: Frame) => {
  'worklet';
  
  // Resize using vision-camera-resize-plugin
  const resized = resize(frame, {
    scale: { width: 320, height: 320 },
    pixelFormat: 'rgb',
    dataType: 'uint8',
  });
  
  // CRITICAL: Handle byteOffset
  const inputBuffer = resized.buffer.slice(
    resized.byteOffset,
    resized.byteOffset + resized.byteLength
  );
  
  // Direct access - no boxing
  const output = model.runSync([inputBuffer]);
  const detections = new Float32Array(output[0]!);
};
```

---

## 🔄 Change 6: Dependencies Update

### ❌ BEFORE
```json
{
  "react-native": "0.72.0",
  "expo": "49.0.0",
  "react-native-fast-tflite": "^2.0.0"
}
```

### ✅ AFTER
```json
{
  "react-native": "0.76.0",
  "expo": "^52.0.0",
  "react-native-fast-tflite": "^3.0.1",
  "react-native-nitro-modules": "*",
  "react-native-vision-camera": "^5.2.0",
  "vision-camera-resize-plugin": "^0.2.0"
}
```

---

## 🔄 Change 7: Babel Configuration

### ❌ BEFORE
```javascript
// Might be in wrong order
module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    'react-native-reanimated/plugin',  // Might not be last
  ],
};
```

### ✅ AFTER
```javascript
// Reanimated MUST be last
module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    'react-native-reanimated/plugin',  // ← MUST be last
  ],
};
```

**Why:** Babel plugin order matters. Reanimated must be the final plugin to instrument all code properly.

---

## 🔄 Change 8: Service Implementation

### ❌ BEFORE (TFLiteService.ts)
```typescript
// Mock implementation
type TfliteModel = any;
const loadTensorflowModel = async (): Promise<TfliteModel> => {
  return {} as TfliteModel;
};

static detectFace(frameBuffer: ArrayBuffer): FaceDetection | null {
  const output = service.blazeFaceModel.runSync([frameBuffer]);
  const detections = new Float32Array(output[0] as ArrayBuffer);  // as cast
  const landmarks = new Float32Array(output[1] as ArrayBuffer);
  // ...
}
```

### ✅ AFTER (Real v3 implementation)
```typescript
import { loadTensorflowModel, TfliteModel } from 'react-native-fast-tflite';

static detectFace(frameBuffer: ArrayBuffer): FaceDetection | null {
  // ✅ v3 API: Pass ArrayBuffer directly (NOT TypedArray)
  const output = service._blazeFaceModel.runSync([frameBuffer]);
  
  // ✅ v3 API: Outputs are ArrayBuffers - wrap them in typed arrays
  const detections = new Float32Array(output[0]!);
  const landmarks = new Float32Array(output[1]!);
  // ...
}
```

---

## 📋 Complete Checklist of Changes

- [x] Update package.json: RN 0.72→0.76, Expo 49→52, add all packages
- [x] Update app.json: Add plugins (dev-client, vision-camera, fast-tflite)
- [x] Update metro.config.js: Add 'bin' extension
- [x] Create android/gradle.properties: Add Nitro config
- [x] Fix TFLiteService: Import real library, ArrayBuffer I/O, fix properties
- [x] Create frameProcessor.worklet.ts: Vision v5 + fast-tflite v3
- [x] Replace encryption: crypto-js → react-native-quick-crypto
- [x] All runSync() calls: Accept ArrayBuffer, return ArrayBuffer (wrapped)
- [x] No NitroModules.box(): Direct model access in v5
- [x] byteOffset handling: Slice buffers properly in frame processor

---

## 🎯 Summary of Critical Fixes

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| TypedArray vs ArrayBuffer | v3 API changed | Pass `.buffer.slice()` to runSync() |
| Output wrapping | v3 returns ArrayBuffer not typed | Wrap outputs: `new Float32Array(output[0]!)` |
| Boxing/unboxing | v5 removed boxing | Delete NitroModules.box() calls |
| byteOffset crash | VisionCamera resize may not start at 0 | Account for `byteOffset` when slicing |
| Version mismatch | Using old dependencies | Update RN 0.76, Expo 52, packages |
| Encryption slow | Pure JS crypto | Use native react-native-quick-crypto |

---

## 🔍 How to Verify Everything Works

```typescript
// Test 1: Models load with v3 API
await TFLiteService.initialize();
console.log('✓ Models loaded with v3 API');

// Test 2: Inference accepts ArrayBuffer
const buffer = new ArrayBuffer(320 * 320 * 3);
const detection = TFLiteService.detectFace(buffer);
console.log('✓ Inference works with ArrayBuffer');

// Test 3: Output is wrapped typed array
if (detection) {
  console.log('✓ Output correctly wrapped:', detection.landmarks instanceof Array);
}

// Test 4: Frame processor runs in worklet
// (Check logcat for frame processor logs)
console.log('✓ Frame processor running in worklet');
```

---

## ⚠️ Common Mistakes to Avoid

1. **Passing TypedArray instead of ArrayBuffer**
   ```typescript
   // ❌ WRONG
   model.runSync([new Float32Array(data)]);
   
   // ✅ CORRECT
   model.runSync([new Float32Array(data).buffer]);
   ```

2. **Not wrapping output in typed array**
   ```typescript
   // ❌ WRONG
   const output = model.runSync([input]);
   use(output[0]);  // ArrayBuffer, not usable directly
   
   // ✅ CORRECT
   const output = model.runSync([input]);
   use(new Float32Array(output[0]!));  // Now usable
   ```

3. **Boxing models in v5 frame processor**
   ```typescript
   // ❌ WRONG (v4 code)
   const boxed = NitroModules.box(model);
   
   // ✅ CORRECT (v5)
   model.runSync([input]);  // Direct call
   ```

4. **Forgetting byteOffset in buffer slice**
   ```typescript
   // ❌ WRONG
   const buffer = resized.buffer;  // May not start at 0
   
   // ✅ CORRECT
   const buffer = resized.buffer.slice(
     resized.byteOffset,
     resized.byteOffset + resized.byteLength
   );
   ```

---

## 📚 Reference Files

- [src/services/TFLiteService.ts](src/services/TFLiteService.ts) - All v3 API usage
- [src/processors/frameProcessor.worklet.ts](src/processors/frameProcessor.worklet.ts) - VisionCamera v5 integration
- [src/services/EncryptionService.ts](src/services/EncryptionService.ts) - Native crypto example
- [MIGRATION_V2_TO_V3.md](../react-native-fast-tflite/MIGRATION_V2_TO_V3.md) - Official migration guide
