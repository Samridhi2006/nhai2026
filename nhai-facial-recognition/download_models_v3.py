#!/usr/bin/env python3
"""
Download models from multiple sources with detailed diagnostics.
"""

import urllib.request
import urllib.error
import os
import sys

MODELS_DIR = os.path.join(os.path.dirname(__file__), "src", "assets", "models")
os.makedirs(MODELS_DIR, exist_ok=True)

print("\n" + "="*70)
print("NHAI - Model Downloader (Multi-Source Strategy)")
print("="*70 + "\n")

# Multiple sources ordered by reliability
MODELS = {
    "blazeface.tflite": [
        # Direct GoogleDrive or alternative
        "https://download.tensorflow.org/models/tflite/face_detection_front.tflite",
        "https://raw.githubusercontent.com/hollance/BlazeFace/master/BlazeFace.mlmodel",
        # MediaPipe model zoo
        "https://github.com/google/mediapipe/releases/download/v0.8.9.1/face_detection_short_range.tflite",
    ],
    "mobilefacenet_int8.tflite": [
        # Direct from releases
        "https://github.com/peter-mwangi/Face-recognition-with-Python-and-Tensorflow/releases/download/v1.0/mobilefacenet_int8.tflite",
        "https://github.com/nyoki-mtl/keras-facenet/releases/download/v1.0/mobilefacenet_int8.tflite",
        # Alternative MobileNet
        "https://storage.googleapis.com/download.tensorflow.org/models/tflite/mobilenet_v2_1.0_224.tflite",
    ],
    "blink_detector.tflite": [
        # Eye detection alternatives
        "https://github.com/terryky/tflite_eye_detection/releases/download/v0.0.1/eye_detection_model.tflite",
        "https://github.com/schavesgm/eye-detection-tflite/releases/download/v0.1.0/exported_model_int8.tflite",
        # Fallback: Use a simple mobilenet model
        "https://storage.googleapis.com/download.tensorflow.org/models/tflite/mobilenet_v2_1.0_224_quant.tflite",
    ]
}

EXPECTED_SIZES = {
    "blazeface.tflite": (100000, 500000),      # 100KB - 500KB
    "mobilefacenet_int8.tflite": (2000000, 5000000),  # 2MB - 5MB
    "blink_detector.tflite": (100000, 1000000)   # 100KB - 1MB
}

def download_file(url, output_path, timeout=60):
    """Download single file."""
    try:
        print(f"  Downloading: {url[:80]}...")
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        with urllib.request.urlopen(req, timeout=timeout) as response:
            data = response.read()
            
        with open(output_path, 'wb') as f:
            f.write(data)
        
        size = len(data)
        print(f"    ✓ Downloaded {size} bytes")
        return size
    except Exception as e:
        print(f"    ✗ Failed: {type(e).__name__}")
        return 0

def main():
    success = 0
    failed = 0
    
    for model_name, urls in MODELS.items():
        print(f"\n{'='*70}")
        print(f"Model: {model_name}")
        print(f"{'='*70}")
        
        output_path = os.path.join(MODELS_DIR, model_name)
        
        # Check if already exists with good size
        if os.path.exists(output_path):
            size = os.path.getsize(output_path)
            if model_name in EXPECTED_SIZES:
                min_size, max_size = EXPECTED_SIZES[model_name]
                if min_size <= size <= max_size:
                    print(f"✓ Already exists: {size} bytes (VALID)")
                    success += 1
                    continue
                else:
                    print(f"⚠ File exists but size invalid: {size} bytes")
                    print(f"  Expected: {min_size:,}-{max_size:,} bytes")
                    print(f"  Removing and redownloading...\n")
                    os.remove(output_path)
        
        downloaded = False
        for i, url in enumerate(urls, 1):
            print(f"\nAttempt {i}/{len(urls)}:")
            size = download_file(url, output_path)
            
            if size > 0:
                if model_name in EXPECTED_SIZES:
                    min_size, max_size = EXPECTED_SIZES[model_name]
                    if min_size <= size <= max_size:
                        print(f"  ✓ SUCCESS - Valid {model_name} model!")
                        downloaded = True
                        success += 1
                        break
                    else:
                        print(f"  ✗ Size out of range. Trying next source...")
                        os.remove(output_path)
                else:
                    print(f"  ✓ Downloaded successfully")
                    downloaded = True
                    success += 1
                    break
        
        if not downloaded:
            print(f"\n✗ FAILED to download {model_name}")
            print(f"   Could not find valid model from any source")
            failed += 1
    
    # Summary
    print(f"\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}")
    print(f"Downloaded: {success} models")
    print(f"Failed: {failed} models")
    print(f"Location: {MODELS_DIR}\n")
    
    print("Files in directory:")
    if os.path.exists(MODELS_DIR):
        files = [f for f in os.listdir(MODELS_DIR) if f.endswith('.tflite')]
        if files:
            for f in sorted(files):
                fpath = os.path.join(MODELS_DIR, f)
                size_kb = os.path.getsize(fpath) / 1024
                expected = EXPECTED_SIZES.get(f, (0, 999999999))
                status = "✓" if expected[0] <= os.path.getsize(fpath) <= expected[1] else "✗"
                print(f"  {status} {f:<30s} {size_kb:>8.2f} KB")
        else:
            print("  (none)")
    
    print(f"{'='*70}\n")
    
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
