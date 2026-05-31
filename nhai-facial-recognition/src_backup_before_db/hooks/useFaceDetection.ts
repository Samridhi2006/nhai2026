import { useState, useCallback } from 'react';
import { useFrameProcessor } from 'react-native-vision-camera';
import { useRunOnJS, useSharedValue } from 'react-native-worklets-core';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { TFLiteService, FaceDetection } from '../services/TFLiteService';

export function useFaceDetection(
  onFaceDetected?: (detection: FaceDetection | null, embedding: Float32Array | null) => void
) {
  const captureRequested = useSharedValue(false);
  
  const { resize } = useResizePlugin();

  // We must get the models outside the worklet so they can be captured by the worklet closure
  const tfliteService = TFLiteService.getInstance();
  const blazeFaceModel = tfliteService.blazeFaceModel;
  const mobileFaceNetModel = tfliteService.mobileFaceNetModel; // Need to add this getter

  const handleDetection = useCallback((detection: FaceDetection | null, embedding: Float32Array | null) => {
    if (onFaceDetected) {
      onFaceDetected(detection, embedding);
    }
    if (embedding && captureRequested.value) {
      captureRequested.value = false; // Reset after successful capture
    }
  }, [onFaceDetected, captureRequested]);

  // Create a worklet-safe JS callback using useRunOnJS
  const handleDetectionJS = useRunOnJS(handleDetection, [handleDetection]);

  const requestCapture = useCallback(() => {
    captureRequested.value = true;
  }, [captureRequested]);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!blazeFaceModel) return;

    try {
      // 1. Resize for BlazeFace (128x128)
      const resized = resize(frame, {
        scale: { width: 128, height: 128 },
        pixelFormat: 'rgb',
        dataType: 'float32',
      });

      const inputTypedArray = new Float32Array(resized.buffer);
      // Normalize to [-1, 1] for BlazeFace
      for (let i = 0; i < inputTypedArray.length; i++) {
        inputTypedArray[i] = (inputTypedArray[i] / 127.5) - 1.0;
      }

      // Ensure we pass raw bytes to runSync
      const inputBytes = new Uint8Array(inputTypedArray.buffer);
      const outputs = blazeFaceModel.runSync([inputBytes]);
      
      // BlazeFace outputs: regressors [1, 896, 16], classifiers [1, 896, 1]
      // Handle both v2 (Uint8Array) and v3 (ArrayBuffer) return types
      const out0 = outputs[0]!;
      const out1 = outputs[1]!;
      const regressors = new Float32Array(out0.buffer || out0);
      const classifiers = new Float32Array(out1.buffer || out1);

      // Find highest confidence face
      let bestDetection: FaceDetection | null = null;
      let maxScore = 0.5; // Threshold (works for both logits > 0.5 and probabilities > 0.5)
      let maxIdx = -1;

      for (let i = 0; i < 896; i++) {
        const score = classifiers[i];
        if (score > maxScore) {
          maxScore = score;
          maxIdx = i;
        }
      }

      let embeddingResult: Float32Array | null = null;

      if (maxIdx >= 0) {
        const offset = maxIdx * 16;
        
        // Decode anchor
        let cx_anchor = 0, cy_anchor = 0;
        if (maxIdx < 512) {
          const cell = Math.floor(maxIdx / 2);
          cx_anchor = ((cell % 16) + 0.5) / 16.0;
          cy_anchor = (Math.floor(cell / 16) + 0.5) / 16.0;
        } else {
          const cell = Math.floor((maxIdx - 512) / 6);
          cx_anchor = ((cell % 8) + 0.5) / 8.0;
          cy_anchor = (Math.floor(cell / 8) + 0.5) / 8.0;
        }

        // Decode bounding box
        // BlazeFace returns offsets in pixels for a 128x128 image
        const dx = regressors[offset + 0] / 128.0;
        const dy = regressors[offset + 1] / 128.0;
        const w  = regressors[offset + 2] / 128.0;
        const h  = regressors[offset + 3] / 128.0;

        const cx = cx_anchor + dx;
        const cy = cy_anchor + dy;
        const xmin = Math.max(0, cx - w / 2);
        const ymin = Math.max(0, cy - h / 2);
        const xmax = Math.min(1, cx + w / 2);
        const ymax = Math.min(1, cy + h / 2);
        const boxWidth = xmax - xmin;
        const boxHeight = ymax - ymin;

        // Decode landmarks
        const faceLandmarks = [];
        for (let j = 0; j < 6; j++) {
          const lx = regressors[offset + 4 + j * 2] / 128.0;
          const ly = regressors[offset + 4 + j * 2 + 1] / 128.0;
          faceLandmarks.push({
            x: cx_anchor + lx,
            y: cy_anchor + ly,
          });
        }

        const rightEye = faceLandmarks[0];
        const leftEye = faceLandmarks[1];
        const nose = faceLandmarks[2];
        
        const distRight = Math.abs(nose.x - rightEye.x);
        const distLeft = Math.abs(leftEye.x - nose.x);
        const eyeDist = Math.abs(leftEye.x - rightEye.x);
        
        // Positive means face is turned to the right side
        const yaw = eyeDist > 0 ? (distLeft - distRight) / eyeDist : 0;
        
        const isWellFramed = boxWidth > 0.25 && boxHeight > 0.25 &&
                             xmin > 0.05 && xmax < 0.95 &&
                             ymin > 0.05 && ymax < 0.95;

        // If score is > 1.0 it's likely a logit, else it's already a probability
        const confidence = maxScore > 1.0 ? 1 / (1 + Math.exp(-maxScore)) : maxScore;

        bestDetection = {
          boundingBox: { xmin, ymin, width: boxWidth, height: boxHeight },
          landmarks: faceLandmarks,
          confidence: confidence,
          yaw,
          pitch: 0,
          isWellFramed,
        };

        // If a capture was requested and we have the MobileFaceNet model
        if (captureRequested.value && mobileFaceNetModel) {
          // Denormalize coords to absolute pixels of the original frame
          const fw = frame.width;
          const fh = frame.height;
          
          // Add some padding to the crop
          const padding = 0.2;
          const width = (xmax - xmin) * fw;
          const height = (ymax - ymin) * fh;
          
          let cropX = Math.max(0, (xmin * fw) - (width * padding));
          let cropY = Math.max(0, (ymin * fh) - (height * padding));
          let cropW = Math.min(fw - cropX, width * (1 + padding * 2));
          let cropH = Math.min(fh - cropY, height * (1 + padding * 2));

          const faceCropFloat = resize(frame, {
            scale: { width: 112, height: 112 },
            crop: { x: cropX, y: cropY, width: cropW, height: cropH },
            pixelFormat: 'rgb',
            dataType: 'float32',
          });

          const cropTypedArray = new Float32Array(faceCropFloat.buffer);
          // Normalize to [-1, 1] for Float32 inference
          for (let i = 0; i < cropTypedArray.length; i++) {
            cropTypedArray[i] = (cropTypedArray[i] / 127.5) - 1.0;
          }
          const cropBytesFloat32 = new Uint8Array(cropTypedArray.buffer);

          let embOutputs;
          try {
            // First attempt: Assume model expects Float32 input (standard for TF Hub models)
            embOutputs = mobileFaceNetModel.runSync([cropBytesFloat32]);
          } catch (err) {
            // Fallback: Model is fully quantized and expects Int8/Uint8 input
            const faceCropInt8 = resize(frame, {
              scale: { width: 112, height: 112 },
              crop: { x: cropX, y: cropY, width: cropW, height: cropH },
              pixelFormat: 'rgb',
              dataType: 'uint8',
            });
            const uint8Arr = new Uint8Array(faceCropInt8.buffer);
            // Convert [0, 255] to [-128, 127] for Int8 models
            const int8Arr = new Int8Array(112 * 112 * 3);
            for (let i = 0; i < uint8Arr.length; i++) {
              int8Arr[i] = uint8Arr[i] - 128;
            }
            embOutputs = mobileFaceNetModel.runSync([new Uint8Array(int8Arr.buffer)]);
          }
          
          const embOut0 = embOutputs[0]!;
          const embBuffer = embOut0.buffer || embOut0;
          
          // Check byte length to safely decode int8 vs float32 model outputs
          if (embBuffer.byteLength === 512) {
            // Float32 output (128 floats * 4 bytes)
            embeddingResult = new Float32Array(embBuffer);
          } else if (embBuffer.byteLength === 128) {
            // Int8 or Uint8 output (128 values * 1 byte)
            const intArray = new Int8Array(embBuffer);
            embeddingResult = new Float32Array(128);
            for (let i = 0; i < 128; i++) {
              embeddingResult[i] = intArray[i];
            }
          } else {
            // Fallback for unexpected sizes (e.g. 192D embeddings)
            const len = embBuffer.byteLength / 4;
            embeddingResult = new Float32Array(embBuffer, 0, Math.floor(len));
          }
          
          // CRITICAL: Reset the flag immediately inside the worklet so we don't capture multiple frames
          captureRequested.value = false;
        }
      }

      // Call the pre-captured JS function
      handleDetectionJS(bestDetection, embeddingResult);
    } catch (error: any) {
      console.error('[frameProcessor] Error:', error.message || String(error));
    }
  }, [blazeFaceModel, mobileFaceNetModel, captureRequested, handleDetectionJS, resize]);

  return {
    frameProcessor,
    requestCapture,
  };
}
