/**
 * RegisteredUsersScreen — View, search, delete, re-register employees
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, Alert, ActivityIndicator, StatusBar, Image,
} from 'react-native';
import { DatabaseService, Employee } from '../services/DatabaseService';
import { FaceStorage } from '../services/FaceStorage';
import { ScreenName } from '../../App';

interface Props { 
  onBack: () => void; 
  onNavigate: (screen: ScreenName, params?: any) => void;
}

export const RegisteredUsersScreen: React.FC<Props> = ({ onBack, onNavigate }) => {
  const [users, setUsers] = useState<Employee[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Employee | null>(null);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const dbService = DatabaseService.getInstance();
      const all = await dbService.getAllEmployees();
      const data = q.trim() ? all.filter(e => e.name.toLowerCase().includes(q.toLowerCase()) || e.employee_id.toLowerCase().includes(q.toLowerCase())) : all;
      setUsers(data);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(() => load(query), 300); return () => clearTimeout(t); }, [query]);

  const handleDelete = (user: Employee) => {
    Alert.alert('Delete User', `Delete ${user.name} (${user.employee_id})?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await FaceStorage.deleteFace(user.id.toString());
        const dbService = DatabaseService.getInstance();
        const updated = await dbService.getAllEmployees();
        setUsers(updated);
        if (selected?.id === user.id) setSelected(null);
      }},
    ]);
  };

  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const renderDetail = () => {
    if (!selected) return null;
    return (
      <View style={s.detailPanel}>
        <View style={s.detailHeader}>
          <View style={s.avatar}>
            {selected.photo_path && selected.photo_path !== 'demo_photo_path' ? (
              <Image source={{ uri: selected.photo_path.startsWith('file://') ? selected.photo_path : `file://${selected.photo_path}` }} style={s.avatarImage} />
            ) : (
              <Text style={s.avatarTxt}>{selected.name[0].toUpperCase()}</Text>
            )}
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={s.detailName}>{selected.name}</Text>
            <Text style={s.detailRole}>{selected.designation || 'Staff'}</Text>
            <Text style={s.detailId}>ID: {selected.employee_id}</Text>
          </View>
          <TouchableOpacity onPress={() => setSelected(null)}><Text style={s.closeBtn}>✕</Text></TouchableOpacity>
        </View>
        <View style={s.detailRow}><Text style={s.detailKey}>Designation</Text><Text style={s.detailVal}>{selected.designation}</Text></View>
        <View style={s.detailRow}><Text style={s.detailKey}>Age</Text><Text style={s.detailVal}>{selected.age || 'N/A'}</Text></View>
        <View style={s.detailRow}><Text style={s.detailKey}>Phone</Text><Text style={s.detailVal}>{selected.phone || 'N/A'}</Text></View>
        <View style={s.detailRow}><Text style={s.detailKey}>Email</Text><Text style={s.detailVal}>{selected.email || 'N/A'}</Text></View>
        <View style={s.detailRow}><Text style={s.detailKey}>Registered On</Text><Text style={s.detailVal}>{fmtDate(selected.registeredAt)}</Text></View>
        <View style={s.detailRow}><Text style={s.detailKey}>Status</Text>
          <View style={s.activeBadge}><Text style={s.activeTxt}>Active</Text></View>
        </View>
        <View style={s.detailActions}>
          <TouchableOpacity style={s.reregBtn} onPress={() => { const id = selected.id; setSelected(null); onNavigate('Registration', { reRegisterId: id }); }}>
            <Text style={s.reregTxt}>Re-Register</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.delBtn} onPress={() => handleDelete(selected)}>
            <Text style={s.delTxt}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: Employee }) => (
    <TouchableOpacity style={[s.card, selected?.id === item.id && s.cardSel]} onPress={() => setSelected(item)}>
      <View style={s.rowAvatar}>
        {item.photo_path && item.photo_path !== 'demo_photo_path' ? (
          <Image source={{ uri: item.photo_path.startsWith('file://') ? item.photo_path : `file://${item.photo_path}` }} style={s.rowAvatarImg} />
        ) : (
          <Text style={s.rowAvatarTxt}>{item.name[0].toUpperCase()}</Text>
        )}
      </View>
      <View style={s.rowInfo}>
        <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.rowId}>ID: {item.employee_id}</Text>
        <Text style={s.cardDate}>Registered {fmtDate(item.registeredAt)}</Text>
      </View>
      <TouchableOpacity style={s.cardDel} onPress={() => handleDelete(item)}>
        <Text style={s.cardDelTxt}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a1628" />
      <View style={s.header}>
        <TouchableOpacity onPress={onBack}><Text style={s.backTxt}>← Back</Text></TouchableOpacity>
        <Text style={s.title}>Employee Details</Text>
        <Text style={s.count}>{users.length} employee{users.length !== 1 ? 's' : ''}</Text>
      </View>

      <View style={s.searchBox}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput style={s.searchInput} placeholder="Search by name, ID or designation..."
          placeholderTextColor="#aaa" value={query} onChangeText={setQuery} />
        {query ? <TouchableOpacity onPress={() => setQuery('')}><Text style={s.clearBtn}>✕</Text></TouchableOpacity> : null}
      </View>

      {renderDetail()}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#007AFF" size="large" />
      ) : users.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>👥</Text>
          <Text style={s.emptyTxt}>{query ? 'No results found' : 'No employees registered yet'}</Text>
          {!query && (
            <TouchableOpacity style={s.emptyBtn} onPress={() => onNavigate('Registration')}>
              <Text style={s.emptyBtnTxt}>Register First Employee</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderItem}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 14, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f4f8' },
  header: { backgroundColor: '#0a1628', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 20 },
  backTxt: { color: '#4a90d9', fontSize: 14, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff' },
  count: { fontSize: 13, color: '#4a90d9', marginTop: 4 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 14, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, elevation: 2 },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#000' },
  clearBtn: { color: '#aaa', fontSize: 16, padding: 4 },
  detailPanel: { backgroundColor: '#fff', marginHorizontal: 14, borderRadius: 14, padding: 18, marginBottom: 8, elevation: 3, borderLeftWidth: 4, borderLeftColor: '#007AFF' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarTxt: { color: '#fff', fontSize: 22, fontWeight: '700' },
  avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  detailName: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  detailEmpId: { fontSize: 13, color: '#888', marginTop: 2 },
  closeBtn: { fontSize: 18, color: '#aaa', padding: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  detailKey: { fontSize: 13, color: '#888' },
  detailVal: { fontSize: 14, fontWeight: '600', color: '#333' },
  activeBadge: { backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  activeTxt: { color: '#4CAF50', fontSize: 12, fontWeight: '700' },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  reregBtn: { flex: 1, backgroundColor: '#e3f0ff', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  reregTxt: { color: '#007AFF', fontWeight: '700', fontSize: 14 },
  delBtn: { flex: 1, backgroundColor: '#ffebee', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  delTxt: { color: '#d32f2f', fontWeight: '700', fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  cardSel: { borderWidth: 2, borderColor: '#007AFF' },
  cardAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0a1628', justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden' },
  cardAvatarTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cardBody: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  cardMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  cardDate: { fontSize: 11, color: '#aaa', marginTop: 2 },
  cardDel: { padding: 8 },
  cardDelTxt: { color: '#ccc', fontSize: 18 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTxt: { fontSize: 16, color: '#888', textAlign: 'center', marginBottom: 20 },
  emptyBtn: { backgroundColor: '#007AFF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
