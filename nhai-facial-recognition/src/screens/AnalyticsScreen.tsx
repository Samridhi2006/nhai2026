/**
 * AnalyticsScreen — Attendance Intelligence Dashboard
 * Bar charts, KPIs, shift breakdown, punctuality, top attendees
 * 100% offline — all computed from SQLite
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, Dimensions,
} from 'react-native';
import { DatabaseService } from '../services/DatabaseService';
import { COLORS, GLOBAL_STYLES } from '../constants/theme';

const W = Dimensions.get('window').width;

interface Props { onBack: () => void; }

type DailyStat = { date: string; count: number; lateCount: number };
type TopAttendee = { name: string; employeeId: string; count: number };
type ShiftBreakdown = { shiftName: string; count: number };

export const AnalyticsScreen: React.FC<Props> = ({ onBack }) => {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<7 | 14 | 30>(7);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [topAttendees, setTopAttendees] = useState<TopAttendee[]>([]);
  const [shifts, setShifts] = useState<ShiftBreakdown[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [monthCount, setMonthCount] = useState(0);
  const [lateToday, setLateToday] = useState(0);
  const [onTimeToday, setOnTimeToday] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dbService = DatabaseService.getInstance();
      const allLogs = await dbService.getAttendanceLogs();
      const allEmployees = await dbService.getAllEmployees();

      const now = new Date();
      now.setHours(0,0,0,0);
      const todayStart = now.getTime();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

      const todayLogs = allLogs.filter(l => l.timestamp >= todayStart);
      const uniqueToday = new Set(todayLogs.map(l => l.employee_id)).size;
      const uniqueMonth = new Set(allLogs.filter(l => l.timestamp >= monthStart).map(l => l.employee_id)).size;
      
      let lateCount = 0;
      const seenForLate = new Set<string>();
      todayLogs.forEach(l => {
        if (!seenForLate.has(l.employee_id)) {
          seenForLate.add(l.employee_id);
          if ((l.status as string) === 'Late') lateCount++;
        }
      });
      
      setTotalUsers(allEmployees.length);
      setTodayCount(uniqueToday);
      setMonthCount(uniqueMonth);
      setLateToday(lateCount);
      setOnTimeToday(Math.max(0, uniqueToday - lateCount));

      const shiftMap = new Map<string, Set<string>>();
      todayLogs.forEach(l => {
        const sn = (l as any).shift_name || 'General Shift';
        if (!shiftMap.has(sn)) shiftMap.set(sn, new Set());
        shiftMap.get(sn)!.add(l.employee_id);
      });
      const shiftArr = Array.from(shiftMap.entries()).map(([shiftName, idSet]) => ({ shiftName, count: idSet.size }));
      setShifts(shiftArr.length > 0 ? shiftArr : [{ shiftName: 'General Shift', count: uniqueToday }]);

      const toLocalYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const daily: DailyStat[] = [];
      const periodStart = now.getTime() - (period - 1) * 86400000;
      const statsMap = new Map<string, { total: Set<string>, late: Set<string> }>();
      
      for (const l of allLogs.filter(log => log.timestamp >= periodStart)) {
        const dObj = new Date(l.timestamp);
        const dStr = toLocalYMD(dObj);
        if (!statsMap.has(dStr)) statsMap.set(dStr, { total: new Set(), late: new Set() });
        statsMap.get(dStr)!.total.add(l.employee_id);
        if ((l.status as string) === 'Late') statsMap.get(dStr)!.late.add(l.employee_id);
      }

      for (let i = period - 1; i >= 0; i--) {
        const d = toLocalYMD(new Date(now.getTime() - i * 86400000));
        const val = statsMap.get(d);
        daily.push({ date: d, count: val?.total.size || 0, lateCount: val?.late.size || 0 });
      }
      setDailyStats(daily);

      const empCounts: Record<string, number> = {};
      for (const l of allLogs) empCounts[l.employee_id] = (empCounts[l.employee_id] || 0) + 1;
      
      const topArr: TopAttendee[] = Object.entries(empCounts)
        .map(([id, count]) => {
          const emp = allEmployees.find(e => e.id === id || e.employee_id === id);
          return { employeeId: emp ? emp.employee_id : id, name: emp?.name || 'Unknown', count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      
      setTopAttendees(topArr);
    } catch(err) {
        console.error(err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const maxCount = useMemo(() => Math.max(...dailyStats.map(d => d.count), 1), [dailyStats]);
  const rate = totalUsers > 0 ? Math.round((todayCount / totalUsers) * 100) : 0;
  const totalShift = shifts.reduce((sum, item) => sum + item.count, 0) || 1;

  const shiftColors: Record<string, string> = {
    'Morning Shift': COLORS.nhaiOrange,
    'Afternoon Shift': COLORS.info,
    'Night Shift': '#AF52DE',
    'General Shift': COLORS.success,
  };

  const fmtDate = (value: string) => {
    const date = new Date(value + 'T00:00:00');
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.nhaiNavy} />
      <View style={s.header}>
        <TouchableOpacity onPress={onBack}><Text style={s.backTxt}>← Back</Text></TouchableOpacity>
        <Text style={s.title}>Workforce Analytics</Text>
        <Text style={s.sub}>Real-Time Local Intelligence</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.nhaiOrange} size="large" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={GLOBAL_STYLES.accentStrip} />

          <View style={s.kpiGrid}>
            {[
              { label: 'Today Verified', value: todayCount, icon: '✅', color: COLORS.success },
              { label: 'This Month Total', value: monthCount, icon: '📅', color: COLORS.info },
              { label: 'Total Registry', value: totalUsers, icon: '👥', color: COLORS.nhaiGold },
              { label: 'Attendance Rate', value: `${rate}%`, icon: '📊', color: COLORS.nhaiOrange },
            ].map(kpi => (
              <View key={kpi.label} style={[s.kpi, { borderTopColor: kpi.color }]}>
                <Text style={s.kpiIcon}>{kpi.icon}</Text>
                <Text style={[s.kpiVal, { color: kpi.color }]}>{kpi.value}</Text>
                <Text style={s.kpiLbl}>{kpi.label}</Text>
              </View>
            ))}
          </View>

          {(onTimeToday + lateToday) > 0 && (
            <View style={[GLOBAL_STYLES.card, { marginTop: 12 }]}>
              <Text style={s.cardTitle}>⏰ Daily Shift Punctuality Split</Text>
              <View style={s.punctRow}>
                <Text style={[s.punctNum, { color: COLORS.success }]}>{onTimeToday}</Text>
                <View style={s.punctBar}>
                  <View style={[s.punctFill, { flex: onTimeToday, backgroundColor: COLORS.success }]} />
                  <View style={[s.punctFill, { flex: lateToday, backgroundColor: COLORS.danger }]} />
                </View>
                <Text style={[s.punctNum, { color: COLORS.danger }]}>{lateToday}</Text>
              </View>
              <View style={s.punctLegend}>
                <Text style={s.punctLegTxt}>🟢 On Time</Text>
                <Text style={s.punctLegTxt}>🔴 Tardy / Late</Text>
              </View>
            </View>
          )}

          {shifts.length > 0 && (
            <View style={[GLOBAL_STYLES.card, { marginTop: 12 }]}>
              <Text style={s.cardTitle}>🕒 Shift Distribution</Text>
              {shifts.map(shift => {
                const width = `${Math.max(10, (shift.count / totalShift) * 100)}%` as any;
                const color = shiftColors[shift.shiftName] ?? COLORS.info;
                return (
                  <View key={shift.shiftName} style={s.shiftRow}>
                    <View style={s.shiftTopRow}>
                      <Text style={s.shiftName}>
                        {shift.shiftName === 'Morning Shift' ? 'Morning Shift (06:00 - 14:00)' :
                         (shift.shiftName === 'Afternoon Shift' || shift.shiftName === 'Evening Shift') ? `${shift.shiftName} (14:00 - 22:00)` :
                         shift.shiftName === 'Night Shift' ? 'Night Shift (22:00 - 06:00)' :
                         shift.shiftName}
                      </Text>
                      <Text style={s.shiftCount}>{shift.count} present</Text>
                    </View>
                    <View style={s.shiftTrack}>
                      <View style={[s.shiftFill, { width, backgroundColor: color }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={[GLOBAL_STYLES.card, { marginTop: 12 }]}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>📈 Historical Aggregate Trend</Text>
              <View style={s.periodPills}>
                {([7, 14, 30] as const).map(value => (
                  <TouchableOpacity
                    key={value}
                    style={[s.pill, period === value && s.pillActive]}
                    onPress={() => setPeriod(value)}
                  >
                    <Text style={[s.pillTxt, period === value && s.pillTxtActive]}>{value}d</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {dailyStats.length === 0 ? (
              <Text style={s.emptyTxt}>No historical records saved in SQLite database grids yet.</Text>
            ) : (
              <View style={s.barChart}>
                {dailyStats.map(daily => {
                  const height = Math.max(6, (daily.count / maxCount) * 110);
                  const lateHeight = daily.lateCount > 0 ? Math.max(3, (daily.lateCount / maxCount) * 110) : 0;
                  return (
                    <View key={daily.date} style={s.barCol}>
                      <Text style={s.barNum}>{daily.count}</Text>
                      <View style={s.barWrap}>
                        <View style={s.barInner}>
                          {lateHeight > 0 && <View style={{ height: lateHeight, backgroundColor: COLORS.danger }} />}
                          <View
                            style={{
                              height: height - lateHeight,
                              backgroundColor: daily.date === new Date().toISOString().split('T')[0] ? COLORS.nhaiOrange : '#90C8FF',
                            }}
                          />
                        </View>
                      </View>
                      <Text style={s.barDate}>{fmtDate(daily.date)}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {topAttendees.length > 0 && (
            <View style={[GLOBAL_STYLES.card, { marginTop: 12 }]}>
              <Text style={s.cardTitle}>🏆 Most Regular Site Workers</Text>
              {topAttendees.map((attendee, index) => (
                <View key={attendee.employeeId} style={s.topRow}>
                  <View style={[s.rank, index === 0 && s.rankGold, index === 1 && s.rankSilver, index === 2 && s.rankBronze]}>
                    <Text style={s.rankTxt}>{index + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.topName}>{attendee.name}</Text>
                    <Text style={s.topId}>ID: {attendee.employeeId}</Text>
                  </View>
                  <View style={s.daysBadge}>
                    <Text style={s.daysNum}>{attendee.count}</Text>
                    <Text style={s.daysLbl}>shifts</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { backgroundColor: COLORS.nhaiNavy, paddingHorizontal: 20, paddingTop: 50, paddingBottom: 20 },
  backTxt: { color: '#4a90d9', fontSize: 14, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '900', color: '#fff' },
  sub: { fontSize: 12, color: '#4a90d9', marginTop: 4 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  kpi: { width: (W - 42) / 2, backgroundColor: '#fff', borderRadius: 14, padding: 14, elevation: 2, borderTopWidth: 4, alignItems: 'center', borderColor: COLORS.border },
  kpiIcon: { fontSize: 22, marginBottom: 4 },
  kpiVal: { fontSize: 28, fontWeight: '900' },
  kpiLbl: { fontSize: 11, color: COLORS.muted, textAlign: 'center', marginTop: 4, fontWeight: '600' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyTxt: { fontSize: 13, color: COLORS.muted, textAlign: 'center', paddingVertical: 20 },
  periodPills: { flexDirection: 'row', gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#f0f4f8' },
  pillActive: { backgroundColor: COLORS.nhaiOrange },
  pillTxt: { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
  pillTxtActive: { color: '#fff', fontWeight: '700' },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingTop: 8 },
  barCol: { flex: 1, alignItems: 'center' },
  barNum: { fontSize: 9, color: COLORS.muted, marginBottom: 2 },
  barWrap: { height: 120, justifyContent: 'flex-end', alignItems: 'center', width: '100%' },
  barInner: { width: '70%', overflow: 'hidden', borderRadius: 4 },
  barDate: { fontSize: 8, color: COLORS.muted, marginTop: 4, textAlign: 'center' },
  punctRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  punctNum: { fontSize: 22, fontWeight: '800', width: 36, textAlign: 'center' },
  punctBar: { flex: 1, height: 16, borderRadius: 8, overflow: 'hidden', flexDirection: 'row', backgroundColor: '#f0f0f0' },
  punctFill: { height: 16 },
  punctLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  punctLegTxt: { fontSize: 12, color: COLORS.muted, fontWeight: '500' },
  shiftRow: { marginBottom: 10 },
  shiftTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  shiftName: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  shiftCount: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  shiftTrack: { height: 8, borderRadius: 999, backgroundColor: '#EEF2F7', overflow: 'hidden' },
  shiftFill: { height: 8, borderRadius: 999 },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rankGold: { backgroundColor: '#FFD700' },
  rankSilver: { backgroundColor: '#C0C0C0' },
  rankBronze: { backgroundColor: '#CD7F32' },
  rankTxt: { fontWeight: '800', fontSize: 12, color: '#fff' },
  topName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  topId: { fontSize: 11, color: COLORS.muted },
  daysBadge: { alignItems: 'center', backgroundColor: '#e3f0ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  daysNum: { fontSize: 16, fontWeight: '800', color: COLORS.info },
  daysLbl: { fontSize: 9, color: '#4a90d9', fontWeight: '600' },
});