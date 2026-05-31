/**
 * AttendanceSheetScreen - Displays all offline marked attendance records
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, Alert
} from 'react-native';
import { DatabaseService, AttendanceRecord } from '../services/DatabaseService';
import { SyncService } from '../services/SyncService';
import { Logger } from '../utils/logger';

interface Props {
  onBack: () => void;
}

export const AttendanceSheetScreen: React.FC<Props> = ({ onBack }) => {
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const dbService = DatabaseService.getInstance();
      const dbLogs = await dbService.getAttendanceLogs();
      setLogs(dbLogs);
    } catch (error) {
      Logger.error('Failed to load attendance logs', error);
      Alert.alert('Error', 'Failed to load attendance logs');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    const unsynced = logs.filter(log => log.synced === 0);
    if (unsynced.length === 0) {
      Alert.alert('Sync Status', 'All attendance records are already synced to AWS server!');
      return;
    }

    try {
      setSyncing(true);
      const dbService = DatabaseService.getInstance();
      const syncService = SyncService.getInstance();
      
      // Upload batch to AWS mock service
      await syncService.syncPendingRecords(unsynced);

      // Mark as synced in SQLite database
      const idsToSync = unsynced.map(log => log.id);
      await dbService.markAttendanceAsSynced(idsToSync);

      Alert.alert('Sync Success ✅', `Successfully synced ${unsynced.length} records to AWS server.`);
      
      // Reload logs
      await loadLogs();
    } catch (error) {
      Logger.error('Sync failed', error);
      Alert.alert('Sync Error', 'Failed to upload logs to AWS server. Please check internet connection.');
    } finally {
      setSyncing(false);
    }
  };

  const formatDateTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  };

  const renderItem = ({ item }: { item: AttendanceRecord }) => {
    return (
      <View style={s.logItem}>
        <View style={s.row}>
          <View style={s.mainInfo}>
            <Text style={s.empName}>{item.name}</Text>
            <Text style={s.empId}>ID: {item.employee_id}</Text>
            <Text style={s.time}>{formatDateTime(item.timestamp)}</Text>
          </View>
          
          <View style={[s.badge, item.synced === 1 ? s.badgeSynced : s.badgePending]}>
            <Text style={s.badgeTxt}>
              {item.synced === 1 ? '☁️ Synced' : '⏳ Pending'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const totalLogs = logs.length;
  const unsyncedCount = logs.filter(log => log.synced === 0).length;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Attendance Sheet</Text>
        <Text style={s.sub}>Locally marked attendance logs</Text>
      </View>

      {/* Stats Board */}
      <View style={s.statsBoard}>
        <View style={s.statBox}>
          <Text style={s.statVal}>{totalLogs}</Text>
          <Text style={s.statLabel}>Total Marks</Text>
        </View>
        <View style={s.statBox}>
          <Text style={[s.statVal, unsyncedCount > 0 && { color: '#ff9500' }]}>{unsyncedCount}</Text>
          <Text style={s.statLabel}>Unsynced</Text>
        </View>
      </View>

      {/* Sync Button */}
      {unsyncedCount > 0 && (
        <TouchableOpacity 
          style={[s.syncBtn, syncing && s.btnDisabled]} 
          onPress={handleSync}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.syncBtnTxt}>🔄 Sync Pending ({unsyncedCount}) to AWS</Text>
          )}
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={s.loadingTxt}>Loading attendance sheets...</Text>
        </View>
      ) : logs.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyTxt}>No attendance logs found.</Text>
          <Text style={s.emptySub}>Marks attendance by scanning registered faces.</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id.toString()}
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
  statsBoard: { 
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, 
    padding: 16, marginBottom: 12, elevation: 1 
  },
  statBox: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '800', color: '#1a1a2e' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 2 },
  syncBtn: {
    backgroundColor: '#007AFF', paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', marginBottom: 12, flexDirection: 'row', justifyContent: 'center'
  },
  syncBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.7 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { marginTop: 10, color: '#666', fontSize: 14 },
  emptyTxt: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 4 },
  emptySub: { fontSize: 13, color: '#666', textAlign: 'center' },
  listContent: { paddingBottom: 20 },
  logItem: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 2
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mainInfo: { flex: 1 },
  empName: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 2 },
  empId: { fontSize: 12, color: '#007AFF', marginBottom: 4 },
  time: { fontSize: 12, color: '#888' },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  badgeSynced: { backgroundColor: '#e2f9eb' },
  badgePending: { backgroundColor: '#fff5e6' },
  badgeTxt: { fontSize: 11, fontWeight: '700', color: '#333' },
  backBtn: {
    backgroundColor: '#1a1a2e', paddingVertical: 14, borderRadius: 10,
    alignItems: 'center', marginTop: 12, marginBottom: 10
  },
  backBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' }
});
