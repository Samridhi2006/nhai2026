import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';
import { Buffer } from 'buffer';
import { TFLiteService } from '../services/TFLiteService';
import { Logger } from './logger';
import * as FileSystem from 'expo-file-system';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

export class ImageProcessor {
  /**
   * Resizes an image to 112x112, decodes its RGB pixels, and runs it through MobileFaceNet.
   * Returns a 128-dimensional biometric embedding.
   */
  static async processFaceAndGetEmbedding(photoUri: string, width?: number, height?: number): Promise<Float32Array> {
    try {
      // 1. First, check the dimensions of the raw photo to see if it's landscape.
      // VisionCamera Android front camera often saves sideways landscape photos without applying EXIF.
      const meta = await manipulateAsync(photoUri, []);
      const actions: any[] = [];
      if (meta.width > meta.height) {
        // Rotate -90 degrees CCW so the face becomes upright
        actions.push({ rotate: -90 });
      }
      
      // 2. Resize the image to a manageable size (e.g. 200px width) to avoid memory issues, 
      actions.push({ resize: { width: 200 } });

      const manipResult = await manipulateAsync(
        photoUri,
        actions,
        { compress: 1, format: SaveFormat.JPEG, base64: true }
      );

      if (!manipResult.base64) {
        throw new Error('Failed to extract base64 from image');
      }

      // 2. Decode JPEG to RGBA buffer using jpeg-js
      const imageBuffer = Buffer.from(manipResult.base64, 'base64');
      const rawImageData = jpeg.decode(imageBuffer, { useTArray: true });
      const imgW = rawImageData.width;
      const imgH = rawImageData.height;
      const data = rawImageData.data;

      // 3. Manually extract the center 112x112 patch from the decoded RGBA pixels
      const TARGET_SIZE = 112;
      const startX = Math.max(0, Math.floor((imgW - TARGET_SIZE) / 2));
      const startY = Math.max(0, Math.floor((imgH - TARGET_SIZE) / 2));

      const float32Data = new Float32Array(TARGET_SIZE * TARGET_SIZE * 3);

      for (let y = 0; y < TARGET_SIZE; y++) {
        for (let x = 0; x < TARGET_SIZE; x++) {
          const srcY = startY + y;
          const srcX = startX + x;
          
          // If we somehow exceed bounds (shouldn't happen), clamp to edge
          const safeY = Math.min(srcY, imgH - 1);
          const safeX = Math.min(srcX, imgW - 1);

          const srcIndex = (safeY * imgW + safeX) * 4;
          const dstIndex = (y * TARGET_SIZE + x) * 3;

          // MobileFaceNet expects RGB, normalized to (pixel - 127.5) / 128.0
          float32Data[dstIndex]     = (data[srcIndex] - 127.5) / 128.0;     // R
          float32Data[dstIndex + 1] = (data[srcIndex + 1] - 127.5) / 128.0; // G
          float32Data[dstIndex + 2] = (data[srcIndex + 2] - 127.5) / 128.0; // B
        }
      }

      // DEBUG: Save the 112x112 crop to visualize it
      try {
        const debugRgba = new Uint8Array(TARGET_SIZE * TARGET_SIZE * 4);
        for (let y = 0; y < TARGET_SIZE; y++) {
          for (let x = 0; x < TARGET_SIZE; x++) {
            const srcY = Math.min(startY + y, imgH - 1);
            const srcX = Math.min(startX + x, imgW - 1);
            const srcIndex = (srcY * imgW + srcX) * 4;
            const dstIndex = (y * TARGET_SIZE + x) * 4;
            debugRgba[dstIndex] = data[srcIndex];
            debugRgba[dstIndex+1] = data[srcIndex+1];
            debugRgba[dstIndex+2] = data[srcIndex+2];
            debugRgba[dstIndex+3] = 255;
          }
        }
        const debugRaw = { width: TARGET_SIZE, height: TARGET_SIZE, data: debugRgba };
        const debugJpeg = jpeg.encode(debugRaw, 100);
        const b64 = Buffer.from(debugJpeg.data).toString('base64');
        const debugPath = FileSystem.documentDirectory + 'debug_face_crop.jpg';
        await FileSystem.writeAsStringAsync(debugPath, b64, { encoding: FileSystem.EncodingType.Base64 });
        Logger.info(`DEBUG CROP SAVED TO: ${debugPath}`);
      } catch (debugErr) {
        Logger.error('Failed to save debug crop', debugErr);
      }

      // 4. Extract biometric embedding using true AI model
      const embedding = TFLiteService.extractEmbedding(float32Data);
      return embedding;

    } catch (e) {
      Logger.error('Failed to process image for embedding', e);
      throw e;
    }
  }
}
