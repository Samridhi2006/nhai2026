/**
 * HomeScreen - Main Navigation
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

interface HomeScreenProps {
  onNavigate: (screen: string) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate }) => {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>NHAI</Text>
        <Text style={styles.subtitle}>Offline Facial Recognition</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>4.3MB</Text>
          <Text style={styles.statLabel}>Models</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>128-D</Text>
          <Text style={styles.statLabel}>Embeddings</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>30FPS</Text>
          <Text style={styles.statLabel}>Processing</Text>
        </View>
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => onNavigate('Attendance')}
        >
          <Text style={styles.menuIcon}>📷</Text>
          <Text style={styles.menuTitle}>Take Attendance</Text>
          <Text style={styles.menuDescription}>
            Real-time face recognition with liveness detection
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => onNavigate('Registration')}
        >
          <Text style={styles.menuIcon}>👤</Text>
          <Text style={styles.menuTitle}>Register Face</Text>
          <Text style={styles.menuDescription}>
            Add a new face to the database
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => onNavigate('Verification')}
        >
          <Text style={styles.menuIcon}>🔐</Text>
          <Text style={styles.menuTitle}>Verify Identity</Text>
          <Text style={styles.menuDescription}>
            Verify against registered faces
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>Features</Text>
        <Text style={styles.infoBullet}>✓ Offline-first architecture</Text>
        <Text style={styles.infoBullet}>✓ Blink-based liveness detection</Text>
        <Text style={styles.infoBullet}>✓ AES-256-GCM encryption</Text>
        <Text style={styles.infoBullet}>✓ AWS sync when online</Text>
        <Text style={styles.infoBullet}>✓ 98% accuracy</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 40,
    alignItems: 'center',
    marginTop: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#E0E0E0',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    marginVertical: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  menuContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  menuItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
  },
  menuIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  menuDescription: {
    fontSize: 12,
    color: '#666',
  },
  infoContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 12,
    padding: 16,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
  },
  infoBullet: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
  },
});
