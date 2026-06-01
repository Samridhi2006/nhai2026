/**
 * Main App Component
 * Simple screen state management for MVP
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Logger } from './src/utils/logger';
import { EncryptionService } from './src/services/EncryptionService';
import { SyncService } from './src/services/SyncService';
import { FaceStorage } from './src/services/FaceStorage';
import { LivenessService } from './src/services/LivenessService';
import { TFLiteService } from './src/services/TFLiteService';
import { HomeScreen } from './src/screens/HomeScreen';
import { RegistrationScreen } from './src/screens/RegistrationScreen';
import { EmployeeDetailsScreen } from './src/screens/EmployeeDetailsScreen';
import { AttendanceScreen } from './src/screens/AttendanceScreen';
import { AttendanceSheetScreen } from './src/screens/AttendanceSheetScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { VerificationScreen } from './src/screens/VerificationScreen';
import { RegisteredUsersScreen } from './src/screens/RegisteredUsersScreen';

export type ScreenName = 'Home' | 'Registration' | 'EmployeeDetails' | 'Attendance' | 'AttendanceSheet' | 'Analytics' | 'Verification' | 'RegisteredUsers';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('Home');
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      Logger.info('Initializing NHAI Facial Recognition App');

      // Initialize encryption service
      Logger.info('Initializing encryption service');
      const encryptionService = EncryptionService.getInstance();
      await encryptionService.initialize();

      // Initialize face storage
      Logger.info('Initializing face storage');
      await FaceStorage.initialize();

      // Initialize TFLite models (non-blocking — app works in demo mode if models missing)
      Logger.info('Initializing TFLite models');
      await TFLiteService.initialize();

      // Initialize liveness service
      Logger.info('Initializing liveness service');
      await LivenessService.initialize();

      // Initialize sync service
      Logger.info('Initializing sync service');
      const syncService = SyncService.getInstance();
      await syncService.initialize();

      Logger.info('App initialization complete');
      setIsInitialized(true);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      Logger.error('App initialization failed', error);
      setInitError(errorMsg);
    }
  };

  const handleNavigate = (screen: ScreenName) => {
    setCurrentScreen(screen);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'Home':
        return <HomeScreen onNavigate={handleNavigate} />;
      case 'Registration':
        return (
          <RegistrationScreen
            onSuccess={() => handleNavigate('Home')}
            onBack={() => handleNavigate('Home')}
          />
        );
      case 'EmployeeDetails':
        return (
          <EmployeeDetailsScreen onBack={() => handleNavigate('Home')} />
        );
      case 'Attendance':
        return (
          <AttendanceScreen onBack={() => handleNavigate('Home')} />
        );
      case 'AttendanceSheet':
        return (
          <AttendanceSheetScreen onBack={() => handleNavigate('Home')} />
        );
      case 'Analytics':
        return <AnalyticsScreen onBack={() => handleNavigate('Home')} />;
      case 'Verification':
        return <VerificationScreen onBack={() => handleNavigate('Home')} />;
      case 'RegisteredUsers':
        return <RegisteredUsersScreen onBack={() => handleNavigate('Home')} onNavigate={handleNavigate} />;
      default:
        return <HomeScreen onNavigate={handleNavigate} />;
    }
  };

  if (!isInitialized) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          {initError ? (
            <>
              <Text style={styles.errorText}>Initialization Error</Text>
              <Text style={styles.errorMessage}>{initError}</Text>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Initializing...</Text>
            </>
          )}
        </View>
      </View>
    );
  }

  return <View style={styles.container}>{renderScreen()}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#d32f2f',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
