/**
 * VerificationScreen - Face Verification UI
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
} from 'react-native';
import { FaceStorage } from '../services/FaceStorage';
import { Logger } from '../utils/logger';

interface VerificationScreenProps {
  onBack: () => void;
}

export const VerificationScreen: React.FC<VerificationScreenProps> = ({ onBack }) => {
  const [faces, setFaces] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadFaces();
  }, []);

  const loadFaces = async () => {
    try {
      const allFaces = FaceStorage.getAllFaces();
      setFaces(allFaces);
      Logger.info(`Loaded ${allFaces.length} registered faces`);
    } catch (error) {
      Logger.error('Failed to load faces', error);
      Alert.alert('Error', 'Failed to load registered faces');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = (faceId: string) => {
    Logger.info(`Starting verification for face: ${faceId}`);
    Alert.alert('Verify', 'Position your face in the camera and stay still for 3 seconds');
  };

  const renderFaceItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.faceItem}
      onPress={() => handleVerify(item.id)}
    >
      <Text style={styles.faceName}>{item.name}</Text>
      <Text style={styles.faceId}>ID: {item.id.slice(0, 8)}</Text>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading faces...</Text>
      </View>
    );
  }

  if (faces.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No registered faces</Text>
        <Text style={styles.emptySubtext}>Register a face first</Text>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verification</Text>
      <Text style={styles.subtitle}>Select a face to verify</Text>

      <FlatList
        data={faces}
        renderItem={renderFaceItem}
        keyExtractor={item => item.id}
        style={styles.list}
      />

      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
    marginTop: 20,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  list: {
    flex: 1,
    marginBottom: 16,
  },
  faceItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
  },
  faceName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  faceId: {
    fontSize: 12,
    color: '#999',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  backButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
