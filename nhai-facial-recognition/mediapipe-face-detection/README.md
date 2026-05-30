# MediaPipe Face Detection

This folder contains code examples from the MediaPipe Face Detection documentation.

**Source**: https://chuoling.github.io/mediapipe/solutions/face_detection.html

## Overview

MediaPipe Face Detection is an ultrafast face detection solution that comes with 6 landmarks and multi-face support. It is based on BlazeFace, a lightweight and well-performing face detector tailored for mobile GPU inference.

## Contents

- `face_detection_python.py` - Python implementation for static images and webcam input
- `face_detection_javascript.html` - JavaScript web demo implementation
- `FaceDetectionAndroid.java` - Android implementation for camera, image, and video input

## Configuration Options

- **model_selection**: 0 for short-range (faces within 2m), 1 for full-range (faces within 5m). Default: 0
- **min_detection_confidence**: Minimum confidence value [0.0, 1.0]. Default: 0.5

## Output

Face detections include:
- Bounding box (xmin, width, ymin, height - normalized to [0.0, 1.0])
- 6 key points: right eye, left eye, nose tip, mouth center, right ear tragion, left ear tragion

## Resources

- **Paper**: [BlazeFace: Sub-millisecond Neural Face Detection on Mobile GPUs](https://arxiv.org/abs/1907.05047)
- **Web Demo**: https://code.mediapipe.dev/codepen/face_detection
- **Python Colab**: https://mediapipe.page.link/face_detection_py_colab
- **Official Repo**: https://github.com/google/mediapipe
