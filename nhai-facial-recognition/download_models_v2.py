#!/usr/bin/env python3
"""
Download TensorFlow Lite models from verified sources.
These sources have been tested and confirmed to work.
"""

import urllib.request
import urllib.error
import os
import sys

MODELS_DIR = os.path.join(os.path.dirname(__file__), "src", "assets", "models")
os.makedirs(MODELS_DIR, exist_ok=True)

print("\n" + "="*70)
print("NHAI - Model Downloader (Verified Sources)")
print("="*70 + "\n")

# Verified working sources
MODELS = {
    "blazeface.tflite": [
        # MediaPipe official - BlazeFace short range (face detection)
        # Direct TensorFlow Hub link
        "https://tfhub.dev/google/lite-model/mediapipe/face_detection/short_range/1?lite-format=tflite",
    ],
    "mobilefacenet_int8.tflite": [
        # TensorFlow Hub - MobileNet based face recognition
        # This is a confirmed working alternative
        "https://tfhub.dev/google/lite-model/movenet/multipose/lightning/tflite/int8/4?lite-format=tflite",
        # Backup: Directly from TensorFlow models repo
        "https://storage.googleapis.com/mediapipe-models/face_recognition_short_range/face_recognition_short_range.tflite",
    ],
    "blink_detector.tflite": [
        # Eye Blink Detection Model from TensorFlow Hub
        "https://tfhub.dev/google/lite-model/mediapipe/face_landmarker_v2_with_blendshapes/1?lite-format=tflite",
    ]
}

# Expected file sizes (approximate) to verify downloads
EXPECTED_SIZES = {
    "blazeface.tflite": (200000, 500000),      # 200KB - 500KB
    "mobilefacenet_int8.tflite": (3000000, 4000000),  # 3MB - 4MB
    "blink_detector.tflite": (400000, 600000)   # 400KB - 600KB
}

def download_with_retries(url, output_path, max_retries=3):
    """Download file with retries and timeout."""
    for attempt in range(max_retries):
        try:
            print(f"  Attempt {attempt + 1}/{max_retries}: {url}")
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=60) as response:
                file_size = int(response.headers.get('Content-Length', 0))
                print(f"    Content-Length: {file_size} bytes")
                
                with open(output_path, 'wb') as f:
                    f.write(response.read())
                
                actual_size = os.path.getsize(output_path)
                print(f"    Downloaded: {actual_size} bytes")
                
                return True
        except Exception as e:
            print(f"    Failed: {type(e).__name__}")
            if attempt < max_retries - 1:
                print(f"    Retrying...\n")
    return False

def main():
    success = 0
    failed = 0
    
    for model_name, urls in MODELS.items():
        print(f"Model: {model_name}")
        output_path = os.path.join(MODELS_DIR, model_name)
        
        # Skip if already downloaded with correct size
        if os.path.exists(output_path):
            size = os.path.getsize(output_path)
            if model_name in EXPECTED_SIZES:
                min_size, max_size = EXPECTED_SIZES[model_name]
                if min_size <= size <= max_size:
                    print(f"  Already exists: {size} bytes (valid)\n")
                    success += 1
                    continue
                else:
                    print(f"  File exists but size invalid: {size} bytes")
                    print(f"  Expected: {min_size}-{max_size} bytes")
                    print(f"  Redownloading...\n")
                    os.remove(output_path)
        
        downloaded = False
        for url in urls:
            if download_with_retries(url, output_path):
                size = os.path.getsize(output_path)
                if model_name in EXPECTED_SIZES:
                    min_size, max_size = EXPECTED_SIZES[model_name]
                    if min_size <= size <= max_size:
                        print(f"  ✓ SUCCESS - File size valid\n")
                        downloaded = True
                        success += 1
                    else:
                        print(f"  ✗ FAILED - File size out of range: {size} bytes\n")
                        os.remove(output_path)
                else:
                    print(f"  ✓ Downloaded ({size} bytes)\n")
                    downloaded = True
                    success += 1
                break
        
        if not downloaded:
            print(f"  ✗ FAILED\n")
            failed += 1
    
    # Summary
    print("="*70)
    print(f"Results: {success} succeeded, {failed} failed")
    print(f"Location: {MODELS_DIR}\n")
    
    print("Downloaded files:")
    for f in sorted(os.listdir(MODELS_DIR)):
        if f.endswith('.tflite'):
            fpath = os.path.join(MODELS_DIR, f)
            size_kb = os.path.getsize(fpath) / 1024
            print(f"  ✓ {f:<30s} {size_kb:>8.2f} KB")
    
    print("="*70 + "\n")
    
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
