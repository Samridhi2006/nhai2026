#!/usr/bin/env python3
"""
Generate placeholder TFLite models for development testing.
These are minimal valid TFLite files that allow the app structure to be tested.
Replace with actual models before production.
"""

import struct
import os

def create_minimal_tflite(filepath, model_name):
    """Create a minimal valid TFLite model file."""
    
    # Minimal TFLite file structure
    # TFLite files start with the magic number 'TFL3'
    
    magic = b'TFL3'
    version = 3
    
    # Create a minimal buffer
    minimal_tflite = bytearray()
    
    # Write magic
    minimal_tflite.extend(magic)
    
    # Write version (uint32, little endian)
    minimal_tflite.extend(struct.pack('<I', version))
    
    # Add minimal model data
    # Add some padding to make it a valid structure
    minimal_tflite.extend(b'\x00' * 1024)
    
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    with open(filepath, 'wb') as f:
        f.write(minimal_tflite)
    
    size_kb = len(minimal_tflite) / 1024
    print(f"  Created: {model_name} ({size_kb:.2f} KB)")

if __name__ == '__main__':
    models_dir = os.path.join(os.path.dirname(__file__), 'assets', 'models')
    
    print("\nGenerating placeholder TFLite models for development...\n")
    
    create_minimal_tflite(
        os.path.join(models_dir, 'blazeface.tflite'),
        'blazeface.tflite (Face Detection)'
    )
    
    create_minimal_tflite(
        os.path.join(models_dir, 'mobilefacenet_int8.tflite'),
        'mobilefacenet_int8.tflite (Face Embeddings)'
    )
    
    create_minimal_tflite(
        os.path.join(models_dir, 'blink_detector.tflite'),
        'blink_detector.tflite (Liveness Detection)'
    )
    
    print(f"\nModels created in: {models_dir}")
    print("\n⚠  IMPORTANT: These are placeholder models for development only!")
    print("   Replace with actual models before production deployment.\n")
