import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, RefreshControl, Dimensions } from 'react-native';
import { DatabaseService } from '../services/DatabaseService';
import { TFLiteService } from '../services/TFLiteService';
import { ScreenName } from '../../App';
import { COLORS, GLOBAL_STYLES } from '../constants/theme';
import { Logger } from '../utils/logger';

const W = Dimensions.get('window').width;

interface Props { onNavigate: (screen: ScreenName) => void; }

export const HomeScreen: React.FC<Props> = ({ onNavigate }) => {
  const [userCount, setUserCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [weeklyData, setWeeklyData] = useState<Array<{ date: string; count: number }>>([]);
  const [lateToday, setLateToday] = useState(0);
  const modelsReady = TFLiteService.modelsAvailable;

  const loadStats = useCallback(async () => {
    try {
      const dbService = DatabaseService.getInstance();
      
      const employees = await dbService.getAllEmployees();
      const uc = employees.length;
      
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const allLogs = await dbService.getAttendanceLogs();
      const todayLogs = allLogs.filter(r => r.timestamp >= todayStart.getTime());
      
      // Deduplicate today's attendance to count unique people
      const uniqueToday = new Set(todayLogs.map(r => r.employee_id));
      const tc = uniqueToday.size;
      
      setUserCount(uc);
      setTodayCount(tc);
      
      // Weekly heatmap data
      const days = 7;
      const now = new Date();
      now.setHours(0,0,0,0);
      const start = now.getTime() - (days - 1) * 86400000;
      
      const statsMap = new Map<string, Set<string>>();
      for (const r of allLogs.filter(l => l.timestamp >= start)) {
        const d = new Date(r.timestamp).toISOString().split('T')[0];
        if (!statsMap.has(d)) statsMap.set(d, new Set());
        statsMap.get(d)!.add(r.employee_id);
      }
      
      const wData = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000).toISOString().split('T')[0];
        wData.push({ date: d, count: statsMap.get(d)?.size || 0 });
      }
      setWeeklyData(wData);
      
      // We don't have shift "Late" status in old DB, just default to 0 for now
      setLateToday(0);
    } catch (e) {
      Logger.warn('Stats load failed', e);
    }
  }, []);

  useEffect(() => { loadStats(); }, []);

  // Auto-refresh every 30 seconds for live feel
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const todayStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const presentPct = userCount > 0 ? Math.round((todayCount / userCount) * 100) : 0;
  const onTimePct = todayCount > 0 ? Math.round(((todayCount - lateToday) / todayCount) * 100) : 100;
  const maxWeekly = Math.max(...weeklyData.map(d => d.count), 1);

  const tiles = [
    { icon:'📷', title:'Take Attendance', desc:'Scan face & mark attendance', screen:'Attendance' as ScreenName, color:'#007AFF' },
    { icon:'📊', title:'Workforce Analytics', desc:'Charts, patterns & local trends', screen:'Analytics' as ScreenName, color:'#AF52DE' },
    { icon:'🔐', title:'Verify Identity', desc:'Verify identity without logging data', screen:'Verification' as ScreenName, color:'#FF9500' },
    { icon:'👤', title:'Register Employee', desc:'Add new face to database', screen:'Registration' as ScreenName, color:'#34C759' },
    { icon:'👥', title:'Registered Users', desc:'View, search & manage employees', screen:'RegisteredUsers' as ScreenName, color:'#FF6B35' },
    { icon:'📋', title:'Attendance Sheet', desc:'Daily & monthly records + export', screen:'AttendanceSheet' as ScreenName, color:'#8B5CF6' },
  ];

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingBottom: 30 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />}
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.nhaiNavy} />
      
      {/* HEADER */}
      <View style={s.header}>
        <View style={s.headerBrand}>
          <View style={s.logoBox}><Text style={s.logoTxt}>NHAI</Text></View>
          <View>
            <Text style={s.brandTitle}>Workforce Attendance System</Text>
            <Text style={s.brandSub}>Ministry of Road Transport & Highways</Text>
          </View>
        </View>
        <View style={s.aiBadge}>
          <View style={[s.dot, modelsReady ? s.dotGreen : s.dotOrange]} />
          <Text style={s.aiTxt}>{modelsReady ? 'TFLite AI Active' : 'Demo Mode — No AI Models'}</Text>
        </View>
      </View>

      <View style={s.main}>
        <View style={GLOBAL_STYLES.accentStrip} />
        
        <View style={s.secHeader}>
          <Text style={s.secTitle}>Site Overview</Text>
          <Text style={s.secMeta}>{todayStr}</Text>
        </View>

        {/* KPI CARDS */}
        <View style={s.kpiGrid}>
          <View style={s.kpiCard}>
            <Text style={s.kpiLbl}>TOTAL WORKERS</Text>
            <Text style={[s.kpiVal, { color: COLORS.nhaiOrange }]}>{userCount}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLbl}>PRESENT TODAY</Text>
            <Text style={[s.kpiVal, { color: COLORS.success }]}>{todayCount}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLbl}>ON-TIME RATE</Text>
            <Text style={[s.kpiVal, { color: onTimePct >= 90 ? COLORS.success : COLORS.danger, fontSize: 20 }]}>{onTimePct}%</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLbl}>AI ENGINE</Text>
            <Text style={[s.kpiVal, { fontSize: 14, marginTop: 8, color: COLORS.nhaiNavy }]}>
              {modelsReady ? '🤖 LOCAL' : '⚠️ DEMO'}
            </Text>
          </View>
        </View>

        {/* WEEKLY HEATMAP */}
        {weeklyData.length > 0 && (
          <View style={[GLOBAL_STYLES.card, { marginBottom: 16 }]}>
            <Text style={s.cardTitle}>📊 7-Day Attendance Heatmap</Text>
            <View style={s.heatmapRow}>
              {weeklyData.map((day, idx) => {
                const intensity = day.count / maxWeekly;
                const isToday = day.date === new Date().toISOString().split('T')[0];
                return (
                  <View key={day.date} style={s.heatmapCol}>
                    <View style={[s.heatmapBar, { 
                      height: Math.max(4, intensity * 60),
                      backgroundColor: isToday ? COLORS.nhaiOrange : 
                        intensity > 0.7 ? '#4CAF50' : 
                        intensity > 0.4 ? '#FF9500' : '#FF3B30'
                    }]} />
                    <Text style={s.heatmapLabel}>{['S','M','T','W','T','F','S'][new Date(day.date + 'T00:00:00').getDay()]}</Text>
                    <Text style={s.heatmapCount}>{day.count}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* SHIFT PROGRESS */}
        <Text style={s.groupTitle}>Active Shift Progress</Text>
        <View style={[GLOBAL_STYLES.card, { marginBottom: 20 }]}>
          <View style={s.shiftTop}>
            <Text style={s.shiftBadge}>☀ Active Workforce</Text>
            <Text style={s.rateTxt}>{presentPct}% Checked In</Text>
          </View>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${presentPct}%`, backgroundColor: COLORS.success }]} />
          </View>
          <Text style={s.progressSub}>{todayCount} of {userCount} employees present</Text>
        </View>

        {/* NAV TILES */}
        <Text style={s.groupTitle}>System Navigation</Text>
        {tiles.map((t, i) => (
          <TouchableOpacity key={i} style={s.tile} onPress={() => onNavigate(t.screen)} activeOpacity={0.8}>
            <View style={[s.tileIcon, { backgroundColor: t.color + '18' }]}><Text style={{ fontSize: 20 }}>{t.icon}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.tileTitle}>{t.title}</Text>
              <Text style={s.tileDesc}>{t.desc}</Text>
            </View>
            <Text style={[s.arrow, { color: t.color }]}>›</Text>
          </TouchableOpacity>
        ))}

        <View style={s.infoCard}>
          <Text style={s.infoTitle}>System Capabilities</Text>
          {[
            '✓ SQLite offline persistent storage',
            '✓ Fully offline — zero internet needed',
            '✓ Shift detection (Morning / Afternoon / Night)',
            '✓ Late-arrival auto-marking (15min grace)',
            '✓ 5-minute attendance deduplication',
            '✓ Analytics dashboard with charts & trends',
            '✓ CSV attendance export',
            modelsReady ? '✓ TFLite AI face recognition active' : '⚠️ Demo mode — add TFLite models to assets/models/',
          ].map((line, i) => <Text key={i} style={s.infoRow}>{line}</Text>)}
        </View>
      </View>
    </ScrollView>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { backgroundColor: COLORS.nhaiNavy, paddingHorizontal: 16, paddingVertical: 14, paddingTop: 50 },
  headerBrand: { flexDirection: 'row', alignItems: 'center' },
  logoBox: { width: 40, height: 40, backgroundColor: COLORS.nhaiOrange, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  logoTxt: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },
  brandTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  brandSub: { color: 'rgba(255,255,255,0.45)', fontSize: 9, textTransform: 'uppercase', marginTop: 1 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: '#ffffff15', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  dotGreen: { backgroundColor: '#4CAF50' },
  dotOrange: { backgroundColor: '#FF9800' },
  aiTxt: { color: '#ccc', fontSize: 11 },
  main: { padding: 16 },
  secHeader: { marginBottom: 16 },
  secTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  secMeta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16, gap: 8 },
  kpiCard: { width: (W - 42) / 2, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, elevation: 1 },
  kpiLbl: { fontSize: 9, color: COLORS.muted, fontWeight: '600' },
  kpiVal: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  heatmapRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 80, paddingTop: 10 },
  heatmapCol: { alignItems: 'center', flex: 1 },
  heatmapBar: { width: '70%', borderRadius: 4, marginBottom: 4 },
  heatmapLabel: { fontSize: 10, color: COLORS.muted, fontWeight: '600', marginTop: 2 },
  heatmapCount: { fontSize: 9, color: COLORS.muted },
  groupTitle: { fontSize: 12, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', marginBottom: 10, marginTop: 4, letterSpacing: 0.5 },
  shiftTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  shiftBadge: { backgroundColor: '#FEF3C7', color: '#92400E', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, fontSize: 11, fontWeight: '600' },
  rateTxt: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  progressBar: { height: 8, backgroundColor: COLORS.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressSub: { fontSize: 11, color: COLORS.muted, marginTop: 6 },
  tile: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, elevation: 1 },
  tileIcon: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  tileTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  tileDesc: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  arrow: { fontSize: 24, fontWeight: '300', marginLeft: 8 },
  infoCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 8, borderWidth: 1, borderColor: COLORS.border },
  infoTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  infoRow: { fontSize: 12, color: COLORS.muted, marginBottom: 5, lineHeight: 18 },
});