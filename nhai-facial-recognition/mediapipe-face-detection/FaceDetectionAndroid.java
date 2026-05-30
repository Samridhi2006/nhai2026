/*
 * MediaPipe Face Detection - Android Implementation
 * Source: https://chuoling.github.io/mediapipe/solutions/face_detection.html
 * License: Apache 2.0
 *
 * This file contains example implementations for Android face detection using:
 * 1. Camera input with OpenGL rendering
 * 2. Static image input
 * 3. Video file input
 */

package com.example.facedetection;

import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Log;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import com.google.mediapipe.framework.image.BitmapImageBuilder;
import com.google.mediapipe.solutions.facedetection.FaceDetection;
import com.google.mediapipe.solutions.facedetection.FaceDetectionOptions;
import com.google.mediapipe.solutions.facedetection.FaceDetectionResult;
import com.google.mediapipe.tasks.vision.core.RunningMode;
import java.io.IOException;

public class FaceDetectionActivity extends AppCompatActivity {
    private static final String TAG = "FaceDetection";

    /**
     * CAMERA INPUT IMPLEMENTATION
     * For real-time face detection from camera with OpenGL rendering
     */
    public void setupCameraInput() {
        // Create face detection options
        FaceDetectionOptions faceDetectionOptions =
                FaceDetectionOptions.builder()
                        .setStaticImageMode(false)
                        .setModelSelection(0)  // 0: short-range, 1: full-range
                        .setRunningMode(RunningMode.LIVE_STREAM)
                        .build();

        FaceDetection faceDetection = new FaceDetection(this, faceDetectionOptions);
        faceDetection.setErrorListener(
                (message, e) -> Log.e(TAG, "MediaPipe Face Detection error: " + message));

        // Set result listener to process detections
        faceDetection.setResultListener(
                faceDetectionResult -> {
                    if (faceDetectionResult.multiFaceDetections().isEmpty()) {
                        return;
                    }
                    
                    // Get first face's nose tip
                    var noseTip = faceDetectionResult
                            .multiFaceDetections()
                            .get(0)
                            .getLocationData()
                            .getRelativeKeypoints(0);  // FaceKeypoint.NOSE_TIP
                    
                    Log.i(TAG, String.format(
                            "Face detected - Nose tip normalized: x=%f, y=%f",
                            noseTip.getX(), noseTip.getY()));
                });
    }

    /**
     * IMAGE INPUT IMPLEMENTATION
     * For detecting faces in static images from gallery
     */
    public void setupImageInput() {
        FaceDetectionOptions faceDetectionOptions =
                FaceDetectionOptions.builder()
                        .setStaticImageMode(true)
                        .setModelSelection(0)
                        .build();

        FaceDetection faceDetection = new FaceDetection(this, faceDetectionOptions);
        faceDetection.setErrorListener(
                (message, e) -> Log.e(TAG, "MediaPipe Face Detection error: " + message));

        // Set result listener
        faceDetection.setResultListener(
                faceDetectionResult -> {
                    if (faceDetectionResult.multiFaceDetections().isEmpty()) {
                        Log.i(TAG, "No faces detected in image");
                        return;
                    }

                    int width = faceDetectionResult.inputBitmap().getWidth();
                    int height = faceDetectionResult.inputBitmap().getHeight();

                    // Get nose tip in pixel coordinates
                    var noseTip = faceDetectionResult
                            .multiFaceDetections()
                            .get(0)
                            .getLocationData()
                            .getRelativeKeypoints(0);

                    Log.i(TAG, String.format(
                            "Face detected - Nose tip pixels: x=%f, y=%f",
                            noseTip.getX() * width, noseTip.getY() * height));
                });

        // Launch image picker
        ActivityResultLauncher<Intent> imageGetter =
                registerForActivityResult(
                        new ActivityResultContracts.StartActivityForResult(),
                        result -> {
                            Intent resultIntent = result.getData();
                            if (resultIntent != null && result.getResultCode() == RESULT_OK) {
                                Bitmap bitmap = null;
                                try {
                                    Uri imageUri = resultIntent.getData();
                                    bitmap = MediaStore.Images.Media.getBitmap(
                                            this.getContentResolver(), imageUri);
                                    // Note: rotate bitmap based on orientation if needed
                                } catch (IOException e) {
                                    Log.e(TAG, "Bitmap reading error: " + e);
                                }
                                
                                if (bitmap != null) {
                                    faceDetection.detectAsync(bitmap);
                                }
                            }
                        });

        Intent pickImageIntent = new Intent(Intent.ACTION_PICK);
        pickImageIntent.setDataAndType(MediaStore.Images.Media.INTERNAL_CONTENT_URI, "image/*");
        imageGetter.launch(pickImageIntent);
    }

    /**
     * VIDEO INPUT IMPLEMENTATION
     * For detecting faces in video files
     */
    public void setupVideoInput() {
        FaceDetectionOptions faceDetectionOptions =
                FaceDetectionOptions.builder()
                        .setStaticImageMode(false)
                        .setModelSelection(0)
                        .setRunningMode(RunningMode.VIDEO)
                        .build();

        FaceDetection faceDetection = new FaceDetection(this, faceDetectionOptions);
        faceDetection.setErrorListener(
                (message, e) -> Log.e(TAG, "MediaPipe Face Detection error: " + message));

        faceDetection.setResultListener(
                faceDetectionResult -> {
                    if (faceDetectionResult.multiFaceDetections().isEmpty()) {
                        return;
                    }

                    var noseTip = faceDetectionResult
                            .multiFaceDetections()
                            .get(0)
                            .getLocationData()
                            .getRelativeKeypoints(0);

                    Log.i(TAG, String.format(
                            "Video - Face detected - Nose tip: x=%f, y=%f",
                            noseTip.getX(), noseTip.getY()));
                });

        // Launch video picker
        ActivityResultLauncher<Intent> videoGetter =
                registerForActivityResult(
                        new ActivityResultContracts.StartActivityForResult(),
                        result -> {
                            Intent resultIntent = result.getData();
                            if (resultIntent != null && result.getResultCode() == RESULT_OK) {
                                Uri videoUri = resultIntent.getData();
                                // Process video frames here
                                Log.i(TAG, "Video selected: " + videoUri);
                            }
                        });

        Intent pickVideoIntent = new Intent(Intent.ACTION_PICK);
        pickVideoIntent.setDataAndType(MediaStore.Video.Media.INTERNAL_CONTENT_URI, "video/*");
        videoGetter.launch(pickVideoIntent);
    }

    /**
     * Configuration options available:
     * - staticImageMode: boolean (true for images, false for video/camera)
     * - modelSelection: 0 or 1 (0: short-range [2m], 1: full-range [5m])
     * - minDetectionConfidence: float [0.0, 1.0] (default: 0.5)
     * - runningMode: LIVE_STREAM, VIDEO, or IMAGE
     */
}
