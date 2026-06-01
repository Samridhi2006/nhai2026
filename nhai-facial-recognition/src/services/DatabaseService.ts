/**
 * DatabaseService - SQLite database with full schema
 * employees: id, name, employee_id, designation, age, phone, email, photo_path, embedding, timestamp
 * attendance: id, employee_id, name, timestamp, synced, latitude, longitude, location_status, shift_name, status
 */

import * as SQLite from 'expo-sqlite';
import { Logger } from '../utils/logger';

export interface Employee {
  id: string;
  employee_id: string;
  name: string;
  designation: string;
  age: number;
  phone: string;
  email: string;
  photo_path: string;
  embedding: string;
  timestamp: number;
  registeredAt: number; // alias for timestamp
}

export interface AttendanceRecord {
  id?: number;
  employee_id: string;
  name: string;
  timestamp: number;
  synced: number;
  latitude?: number;
  longitude?: number;
  location_status?: string;
  shift_name: string;
  status: 'Present' | 'Late';
}

export class DatabaseService {
  private static instance: DatabaseService;
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) DatabaseService.instance = new DatabaseService();
    return DatabaseService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      this.db = await SQLite.openDatabaseAsync('nhai_v3.db');
      await this.db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      try {
        await this.db.execAsync(`ALTER TABLE attendance ADD COLUMN location_status TEXT;`);
        await this.db.execAsync(`ALTER TABLE employees ADD COLUMN designation TEXT;`);
      } catch (e) {
        // Columns might already exist, ignore.
      }
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS employees (
          id TEXT PRIMARY KEY,
          employee_id TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          designation TEXT NOT NULL DEFAULT 'Staff',
          age INTEGER DEFAULT 0,
          phone TEXT DEFAULT '',
          email TEXT DEFAULT '',
          photo_path TEXT DEFAULT '',
          embedding TEXT NOT NULL DEFAULT '[]',
          timestamp INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS attendance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id TEXT NOT NULL,
          name TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          synced INTEGER DEFAULT 0,
          latitude REAL,
          longitude REAL,
          location_status TEXT DEFAULT 'Unknown',
          shift_name TEXT NOT NULL DEFAULT 'General Shift',
          status TEXT NOT NULL DEFAULT 'Present'
        );
        CREATE INDEX IF NOT EXISTS idx_att_ts ON attendance(timestamp);
        CREATE INDEX IF NOT EXISTS idx_att_empid ON attendance(employee_id);
        CREATE INDEX IF NOT EXISTS idx_emp_empid ON employees(employee_id);
      `);

      // Clean up any orphaned attendance records left over from before the cascade delete fix
      await this.db.execAsync('DELETE FROM attendance WHERE employee_id NOT IN (SELECT id FROM employees)');

      this.isInitialized = true;
      Logger.info('DatabaseService v3 initialized');
    } catch (e) { Logger.error('DB init failed', e); throw e; }
  }

  private detectShift(ts: number): { shiftName: string; status: 'Present' | 'Late' } {
    const d = new Date(ts);
    const mins = d.getHours() * 60 + d.getMinutes();
    if (mins >= 6 * 60 && mins < 14 * 60) {
      return { shiftName: 'Morning Shift', status: mins > 6 * 60 + 15 ? 'Late' : 'Present' };
    }
    if (mins >= 14 * 60 && mins < 22 * 60) {
      return { shiftName: 'Evening Shift', status: mins > 14 * 60 + 15 ? 'Late' : 'Present' };
    }
    return { shiftName: 'Night Shift', status: 'Present' };
  }

  async insertEmployee(e: Omit<Employee, 'timestamp' | 'registeredAt'>): Promise<void> {
    if (!this.db) throw new Error('DB not init');
    const empId = e.employee_id || e.id;
    await this.db.runAsync(
      `INSERT OR REPLACE INTO employees (id,employee_id,name,designation,age,phone,email,photo_path,embedding,timestamp)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [e.id, empId, e.name, e.designation || 'Staff', e.age || 0, e.phone || '', e.email || '', e.photo_path || '', e.embedding || '[]', Date.now()]
    );
  }

  async getAllEmployees(): Promise<Employee[]> {
    if (!this.db) return [];
    const rows = await this.db.getAllAsync('SELECT * FROM employees ORDER BY name ASC');
    return rows.map((r: any) => ({ ...r, registeredAt: r.timestamp }));
  }

  async getEmployee(id: string): Promise<Employee | null> {
    if (!this.db) return null;
    const r = await this.db.getFirstAsync('SELECT * FROM employees WHERE id=? OR employee_id=?', [id, id]);
    return r ? { ...r, registeredAt: r.timestamp } : null;
  }

  async deleteEmployee(id: string): Promise<void> {
    if (!this.db) return;
    await this.db.runAsync('DELETE FROM employees WHERE id=?', [id]);
    await this.db.runAsync('DELETE FROM attendance WHERE employee_id=?', [id]);
  }

  async getEmployeeCount(): Promise<number> {
    if (!this.db) return 0;
    const r = await this.db.getFirstAsync('SELECT COUNT(*) as cnt FROM employees');
    return r?.cnt ?? 0;
  }

  async logAttendance(employeeId: string, name: string, lat?: number, lng?: number, locStatus?: string): Promise<void> {
    if (!this.db) throw new Error('DB not init');
    const ts = Date.now();
    const { shiftName, status } = this.detectShift(ts);

    const since = ts - 5 * 60 * 1000;
    const dup = await this.db.getFirstAsync(
      'SELECT COUNT(*) as cnt FROM attendance WHERE employee_id=? AND timestamp>?', [employeeId, since]
    );
    if ((dup?.cnt ?? 0) > 0) { Logger.info(`Dup skip: ${name}`); return; }

    await this.db.runAsync(
      `INSERT INTO attendance (employee_id,name,timestamp,synced,latitude,longitude,location_status,shift_name,status)
       VALUES (?,?,?,0,?,?,?,?,?)`,
      [employeeId, name, ts, lat ?? null, lng ?? null, locStatus ?? 'Unknown', shiftName, status]
    );
    Logger.info(`Attendance: ${name} | ${shiftName} | ${status}`);
  }

  async markAttendanceAsSynced(ids: number[]): Promise<void> {
    if (!this.db || ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await this.db.runAsync(`UPDATE attendance SET synced = 1 WHERE id IN (${placeholders})`, ids);
  }

  async getAttendanceLogs(): Promise<AttendanceRecord[]> {
    if (!this.db) return [];
    return this.db.getAllAsync('SELECT * FROM attendance ORDER BY timestamp DESC');
  }

  async getTodayAttendanceCount(): Promise<number> {
    if (!this.db) return 0;
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const r = await this.db.getFirstAsync(
      'SELECT COUNT(DISTINCT employee_id) as cnt FROM attendance WHERE timestamp>=?', [midnight.getTime()]
    );
    return r?.cnt ?? 0;
  }

  async getAttendanceStats(days: number): Promise<Array<{ date: string; count: number; lateCount: number }>> {
    if (!this.db) return [];
    const logs = await this.getAttendanceLogs();
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const map = new Map<string, { total: Set<string>; late: Set<string> }>();
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      map.set(fmt(d), { total: new Set(), late: new Set() });
    }

    const since = now.getTime() - (days - 1) * 86400000;
    for (const l of logs.filter(l => l.timestamp >= since)) {
      const key = fmt(new Date(l.timestamp));
      if (!map.has(key)) continue;
      map.get(key)!.total.add(l.employee_id);
      if (l.status === 'Late') map.get(key)!.late.add(l.employee_id);
    }

    return Array.from(map.entries()).map(([date, v]) => ({
      date, count: v.total.size, lateCount: v.late.size
    }));
  }

  async getTopAttendees(limit = 5): Promise<Array<{ employeeId: string; name: string; count: number }>> {
    if (!this.db) return [];
    const rows = await this.db.getAllAsync(
      'SELECT employee_id, name, COUNT(*) as count FROM attendance GROUP BY employee_id ORDER BY count DESC LIMIT ?', [limit]
    );
    return rows.map((r: any) => ({ employeeId: r.employee_id, name: r.name, count: r.count }));
  }

  async getShiftBreakdown(date: string): Promise<Array<{ shiftName: string; count: number }>> {
    if (!this.db) return [];
    const midnight = new Date(date + 'T00:00:00').getTime();
    const nextDay = midnight + 86400000;
    const rows = await this.db.getAllAsync(
      'SELECT shift_name, COUNT(DISTINCT employee_id) as count FROM attendance WHERE timestamp>=? AND timestamp<? GROUP BY shift_name', 
      [midnight, nextDay]
    );
    return rows.map((r: any) => ({ shiftName: r.shift_name, count: r.count }));
  }

  async exportCSV(): Promise<string> {
    const logs = await this.getAttendanceLogs();
    const header = 'ID,Employee ID,Name,Date,Time,Shift,Status,Latitude,Longitude,Location\n';
    const rows = logs.map(l => {
      const d = new Date(l.timestamp);
      return `${l.id},${l.employee_id},"${l.name}",${d.toLocaleDateString('en-IN')},${d.toLocaleTimeString('en-IN')},"${l.shift_name}",${l.status},${l.latitude ?? ''},${l.longitude ?? ''},${l.location_status ?? ''}`;
    }).join('\n');
    return header + rows;
  }
}
