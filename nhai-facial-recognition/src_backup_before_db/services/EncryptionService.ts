/**
 * EncryptionService - Stub for development/testing
 * ⚠️  react-native-quick-crypto requires react-native-quick-base64 native linking.
 * For MVP testing, this is a no-op passthrough. Replace with real crypto in production.
 */

import { Logger } from '../utils/logger';

export class EncryptionService {
  private static instance: EncryptionService;

  private constructor() {}

  static getInstance(): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService();
    }
    return EncryptionService.instance;
  }

  async initialize(): Promise<void> {
    Logger.info('EncryptionService: running in passthrough mode (MVP)');
  }

  async encryptFaceData(data: any): Promise<string> {
    // Passthrough: just JSON-encode the data
    return JSON.stringify(data);
  }

  async decryptFaceData(encrypted: string): Promise<any> {
    try {
      return JSON.parse(encrypted);
    } catch {
      return encrypted;
    }
  }
}
