/**
 * EmployeeDetailsScreen - Displays registered employees and allows deletion
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Image, Alert, ActivityIndicator
} from 'react-native';
import { FaceStorage, StoredFace } from '../services/FaceStorage';
import { Logger } from '../utils/logger';

interface Props {
  onBack: () => void;
}

export const EmployeeDetailsScreen: React.FC<Props> = ({ onBack }) => {
  const [employees, setEmployees] = useState<StoredFace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      // FaceStorage cache is synced with SQLite, so we can fetch all faces directly
      const allEmployees = FaceStorage.getAllFaces();
      setEmployees(allEmployees);
    } catch (error) {
      Logger.error('Failed to load employees', error);
      Alert.alert('Error', 'Failed to load employee list');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      'Delete Employee',
      `Are you sure you want to delete ${name}? This will permanently remove their face data and login credentials from this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await FaceStorage.deleteFace(id);
              Alert.alert('Success', 'Employee deleted successfully');
              loadEmployees(); // Reload list
            } catch (error) {
              Logger.error(`Failed to delete employee ${id}`, error);
              Alert.alert('Error', 'Failed to delete employee');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: StoredFace }) => {
    return (
      <View style={s.card}>
        <View style={s.row}>
          {/* Photo */}
          <View style={s.photoContainer}>
            {item.photoPath && item.photoPath !== 'demo_photo_path' ? (
              <Image source={{ uri: item.photoPath }} style={s.photo} />
            ) : (
              <View style={[s.photo, s.placeholderPhoto]}>
                <Text style={s.placeholderTxt}>👤</Text>
              </View>
            )}
          </View>

          {/* Details */}
          <View style={s.details}>
            <Text style={s.name}>{item.name}</Text>
            <Text style={s.idLabel}>ID: <Text style={s.idVal}>{item.id}</Text></Text>
            <Text style={s.info}>Age: {item.age}</Text>
            <Text style={s.info}>Phone: {item.phone}</Text>
            <Text style={s.info}>Email: {item.email}</Text>
          </View>
        </View>

        {/* Action bar */}
        <View style={s.actions}>
          <TouchableOpacity
            style={s.deleteBtn}
            onPress={() => handleDelete(item.id, item.name)}
          >
            <Text style={s.deleteBtnTxt}>🗑️ Delete Employee</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Employee Registry</Text>
        <Text style={s.sub}>Manage registered offline personnel</Text>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={s.loadingTxt}>Loading employees...</Text>
        </View>
      ) : employees.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyTxt}>No employees registered yet.</Text>
          <Text style={s.emptySub}>Register faces in the "Register Face" tab first.</Text>
        </View>
      ) : (
        <FlatList
          data={employees}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
        />
      )}

      <TouchableOpacity style={s.backBtn} onPress={onBack}>
        <Text style={s.backBtnTxt}>← Back to Home</Text>
      </TouchableOpacity>
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6fa', padding: 16 },
  header: { marginTop: 24, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#1a1a2e' },
  sub: { fontSize: 13, color: '#666', marginTop: 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { marginTop: 10, color: '#666', fontSize: 14 },
  emptyTxt: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 4 },
  emptySub: { fontSize: 13, color: '#666', textAlign: 'center' },
  listContent: { paddingBottom: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  photoContainer: { width: 80, height: 80, borderRadius: 10, overflow: 'hidden', backgroundColor: '#eef2f7' },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
  placeholderPhoto: { justifyContent: 'center', alignItems: 'center' },
  placeholderTxt: { fontSize: 32 },
  details: { flex: 1, marginLeft: 16 },
  name: { fontSize: 18, fontWeight: '700', color: '#1a1a2e', marginBottom: 2 },
  idLabel: { fontSize: 12, color: '#666', marginBottom: 6 },
  idVal: { fontWeight: '600', color: '#007AFF' },
  info: { fontSize: 13, color: '#444', marginBottom: 1 },
  actions: {
    borderTopWidth: 1, borderTopColor: '#f0f0f0', marginTop: 12, paddingTop: 10,
    alignItems: 'flex-end'
  },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff0f0',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
    borderColor: '#ffd6d6'
  },
  deleteBtnTxt: { color: '#ff4d4d', fontSize: 12, fontWeight: '700' },
  backBtn: {
    backgroundColor: '#1a1a2e', paddingVertical: 14, borderRadius: 10,
    alignItems: 'center', marginTop: 12, marginBottom: 10
  },
  backBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' }
});
