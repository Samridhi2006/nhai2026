/**
 * RegistrationScreen - Face Registration UI
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { frameProcessor } from '../processors/frameProcessor.worklet';
import { FaceStorage } from '../services/FaceStorage';
import { Logger } from '../utils/logger';

interface RegistrationScreenProps {
  onSuccess: () => void;
  onBack?: () => void;
}

export const RegistrationScreen: React.FC<RegistrationScreenProps> = ({ onSuccess, onBack }) => {
  const [name, setName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const [cameraActive, setCameraActive] = useState(false);
  const CameraView: any = Camera;

  useEffect(() => {
    (async () => {
      if (!hasPermission) {
        const granted = await requestPermission();
        if (granted) setCameraActive(true);
      } else {
        setCameraActive(true);
      }
    })();
  }, [hasPermission]);

  const handleRegister = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }

    setIsProcessing(true);

    try {
      Logger.info(`Starting registration for: ${name}`);

      // Simulate face detection and embedding
      const mockEmbedding = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        mockEmbedding[i] = Math.random();
      }

      // Register face
      const faceId = await FaceStorage.registerFace(name, mockEmbedding);

      Logger.info(`Face registered: ${faceId}`);
      Alert.alert('Success', `Face registered for ${name}`);

      setName('');
      onSuccess();
    } catch (error) {
      Logger.error('Registration failed', error);
      Alert.alert('Error', 'Registration failed: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.overlay}>
        <Text style={styles.title}>Register Face</Text>
        <Text style={styles.subtitle}>Enter a name and register your face</Text>

        <TextInput
          style={styles.input}
          placeholder="Enter your name"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
          editable={!isProcessing}
        />

        <View style={[styles.infoBox, { height: 220, marginBottom: 20 }]}
        >
          {!hasPermission && (
            <View style={styles.fallbackContainer}>
              <Text style={styles.errorText}>
                Camera permission is mandatory for registration.
              </Text>
            </View>
          )}

          {hasPermission && !device && (
            <View style={styles.fallbackContainer}>
              <Text style={styles.errorText}>
                Front camera device not found.
              </Text>
            </View>
          )}

          {device && (
            <CameraView
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={cameraActive}
              frameProcessor={frameProcessor}
              frameProcessorFps={30}
            />
          )}

        </View>

        <TouchableOpacity
          style={[styles.button, isProcessing && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Register</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack ?? onSuccess}
          disabled={isProcessing}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    elevation: 4,
  },
  fallbackContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#ff3b30', fontSize: 16, textAlign: 'center' },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#f5f5f5',
    color: '#000',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  infoBox: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  infoText: {
    color: '#1976D2',
    fontSize: 13,
    marginBottom: 6,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
});
