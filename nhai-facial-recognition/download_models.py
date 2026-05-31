#!/usr/bin/env python3
"""
Download TensorFlow Lite models for NHAI facial recognition.
Tries multiple sources and download methods.
"""

import os
import urllib.request
import urllib.error
import sys
from pathlib import Path

# Create models directory
MODELS_DIR = Path(__file__).parent / "src" / "assets" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

print("\n" + "="*60)
print("NHAI Facial Recognition - Model Downloader")
print("="*60 + "\n")

# Model definitions with multiple sources
MODELS = {
    "blazeface.tflite": [
        # MediaPipe official - face detection short range
        "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float32/1/face_detection_short_range.tflite",
        # Alternative: TensorFlow Hub
        "https://tfhub.dev/mediapipe/lite-model/face_detection/int8/1?lite-format=tflite",
        # GitHub raw content
        "https://raw.githubusercontent.com/google/mediapipe/master/mediapipe/modules/face_detection/face_detection_short_range.tflite",
    ],
    "mobilefacenet_int8.tflite": [
        # GitHub release from face recognition repo
        "https://github.com/peter-mwangi/Face-recognition-with-Python-and-Tensorflow/releases/download/v1.0/mobilefacenet_int8.tflite",
        # Alternative GitHub raw
        "https://raw.githubusercontent.com/peter-mwangi/Face-recognition-with-Python-and-Tensorflow/master/models/mobilefacenet_int8.tflite",
        # TensorFlow Hub - MobileNet based approach
        "https://tfhub.dev/google/lite-model/movenet/singlepose/lightning/tflite/int8/4?lite-format=tflite",
    ],
    "blink_detector.tflite": [
        # MediaPipe face landmarker (can detect eye closure for blink)
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float32/1/face_landmarker.tflite",
        # Alternative: eye detection model
        "https://github.com/terryky/tflite_eye_detection/releases/download/v0.0.1/eye_detection_model.tflite",
    ]
}

def download_file(url, output_path, timeout=30):
    """Download a file from URL to output_path."""
    try:
        print(f"  Downloading from: {url}")
        urllib.request.urlretrieve(url, output_path, timeout=timeout)
        
        size_kb = os.path.getsize(output_path) / 1024
        print(f"  ✓ Success ({size_kb:.2f} KB)\n")
        return True
    except (urllib.error.URLError, urllib.error.HTTPError, Exception) as e:
        print(f"  ✗ Failed: {type(e).__name__}\n")
        return False

def download_models():
    """Download all required models."""
    success_count = 0
    fail_count = 0
    
    for model_name, urls in MODELS.items():
        output_path = MODELS_DIR / model_name
        
        # Skip if already exists and has reasonable size
        if output_path.exists() and output_path.stat().st_size > 10000:
            print(f"Model already exists: {model_name} ({output_path.stat().st_size / 1024:.2f} KB)")
            print()
            success_count += 1
            continue
        
        print(f"Downloading: {model_name}")
        
        downloaded = False
        for i, url in enumerate(urls, 1):
            print(f"  Attempt {i}/{len(urls)}:")
            if download_file(url, output_path):
                downloaded = True
                success_count += 1
                break
        
        if not downloaded:
            print(f"✗ FAILED: {model_name}")
            print(f"  Could not download from any source\n")
            fail_count += 1
            
            if model_name == "blink_detector.tflite":
                print(f"  NOTE: Blink detector is optional for Phase 1\n")
    
    # Summary
    print("="*60)
    print(f"Downloaded: {success_count} / {len(MODELS)} models")
    print(f"Failed: {fail_count}")
    print(f"Location: {MODELS_DIR}\n")
    
    # Verify
    print("Files in models directory:")
    for f in sorted(MODELS_DIR.glob("*.tflite")):
        size_kb = f.stat().st_size / 1024
        print(f"  ✓ {f.name} ({size_kb:.2f} KB)")
    
    print("\n" + "="*60 + "\n")
    
    if success_count >= 2:
        print("✓ Ready to test!\n")
        return 0
    else:
        print("⚠ Some models failed to download")
        print("Try manually downloading from the URLs above\n")
        return 1

if __name__ == "__main__":
    sys.exit(download_models())
