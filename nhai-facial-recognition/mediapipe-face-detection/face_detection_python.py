"""
MediaPipe Face Detection - Python Implementation
Source: https://chuoling.github.io/mediapipe/solutions/face_detection.html
License: Apache 2.0

This example shows how to use MediaPipe Face Detection for:
1. Static images
2. Webcam input
"""

import cv2
import mediapipe as mp

mp_face_detection = mp.solutions.face_detection
mp_drawing = mp.solutions.drawing_utils


def detect_faces_in_images(image_files):
    """
    Detect faces in static images.
    
    Args:
        image_files: List of image file paths
    """
    with mp_face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=0.5) as face_detection:
        for idx, file in enumerate(image_files):
            image = cv2.imread(file)
            if image is None:
                continue
                
            # Convert BGR to RGB and process
            results = face_detection.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))

            # Draw face detections
            if not results.detections:
                continue

            annotated_image = image.copy()
            for detection in results.detections:
                print('Nose tip:')
                print(mp_face_detection.get_key_point(
                    detection, mp_face_detection.FaceKeyPoint.NOSE_TIP))
                mp_drawing.draw_detection(annotated_image, detection)
            
            cv2.imwrite(f'/tmp/annotated_image_{idx}.png', annotated_image)


def detect_faces_in_webcam():
    """
    Detect faces from webcam input.
    Press ESC to exit.
    """
    cap = cv2.VideoCapture(0)
    with mp_face_detection.FaceDetection(
            model_selection=0, min_detection_confidence=0.5) as face_detection:
        while cap.isOpened():
            success, image = cap.read()
            if not success:
                print("Ignoring empty camera frame.")
                continue

            # Improve performance by marking image as not writeable
            image.flags.writeable = False
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            results = face_detection.process(image)

            # Draw annotations
            image.flags.writeable = True
            image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
            if results.detections:
                for detection in results.detections:
                    mp_drawing.draw_detection(image, detection)
            
            # Flip for selfie-view display
            cv2.imshow('MediaPipe Face Detection', cv2.flip(image, 1))
            if cv2.waitKey(5) & 0xFF == 27:  # ESC key
                break
    
    cap.release()


if __name__ == "__main__":
    # Example: Detect faces in webcam
    detect_faces_in_webcam()
    
    # Example: Detect faces in images
    # image_files = ['path/to/image1.jpg', 'path/to/image2.jpg']
    # detect_faces_in_images(image_files)
