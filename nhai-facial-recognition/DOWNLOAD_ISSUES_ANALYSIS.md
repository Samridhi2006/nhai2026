# Model Download Issues - Root Cause Analysis

## What Went Wrong

### Downloads Completed but Files Are Wrong Size
- **blazeface.tflite**: 14 bytes (Expected: 320 KB)
- **mobilefacenet_int8.tflite**: 9 bytes (Expected: 3.5 MB)  
- **blink_detector.tflite**: 243 bytes (Expected: 500 KB)

## Root Causes

### 1. **URL Redirects to Error Pages Instead of Binary**
   - **What happened**: The URLs we used returned HTML error pages, not the actual `.tflite` files
   - **Evidence**: When we checked the content, it showed XML error: `<Error><Code>NoSuchKey</Code>...`
   - **Why**: Google Storage buckets changed their path structure. What used to be at `/mediapipe-models/face_detector/...` no longer exists

### 2. **GitHub Raw URLs Not Stable**
   - GitHub changed how they serve raw content
   - Raw URLs may redirect through CDN cache which caches 404 responses
   - Files moved between branches or deleted from repos

### 3. **Repository Structure Changes**
   - Models were moved to different locations in MediaPipe repo
   - Some alternate repos were archived or deleted
   - Release binaries were removed from old releases

### 4. **GitHub Rate Limiting (Unauthenticated)**
   - Without API token, GitHub limits direct downloads
   - May fail silently by returning very small responses

### 5. **TensorFlow Hub API Changes**
   - TensorFlow Hub changed their download interface
   - Old query parameters (`?lite-format=tflite`) may not work anymore
   - CDN may cache old responses

## The Real Solution

### Use Official TensorFlow Hub
TensorFlow Hub is the **official** source for pre-trained models. URLs are:

```
https://tfhub.dev/google/lite-model/mediapipe/face_detection/short_range/1?lite-format=tflite
https://tfhub.dev/google/lite-model/movenet/multipose/lightning/tflite/int8/4?lite-format=tflite  
https://tfhub.dev/google/lite-model/mediapipe/face_landmarker_v2_with_blendshapes/1?lite-format=tflite
```

### Or Download from Google Storage (Official CDN)
```
https://storage.googleapis.com/mediapipe-models/...
```

### Verify File Sizes
- Don't just check if file exists - verify the size is reasonable
- 14 bytes is obviously wrong (HTML error page)
- 3.5 MB file should be between 3-4 MB

## Next Steps

1. **Run the v2 downloader** (has verification logic):
   ```bash
   python download_models_v2.py
   ```

2. **If that fails**, manually download from TensorFlow Hub:
   - Go to https://tfhub.dev
   - Search for "face detection"
   - Download the TFLite format model
   - Size should be 300+ KB

3. **Last Resort**: Train/convert your own models or contact the maintainers

## Prevention

For future downloads:
- Always verify file size after download
- Use official sources (TensorFlow Hub, Google Storage)
- Don't rely on GitHub raw content URLs for binary files
- Check Content-Length header matches actual file
- Add error checking to scripts (our newer script does this)
