/**
 * DatabaseService - Local SQLite database manager
 * Uses expo-sqlite to store employee registration details and attendance logs offline
 */

import * as SQLite from 'expo-sqlite';
import { Logger } from '../utils/logger';

export interface Employee {
  id: string;
  name: string;
  age: number;
  phone: string;
  email: string;
  photo_path: string;
  embedding: string; // JSON string of float array
  timestamp: number;
}

export interface AttendanceRecord {
  id: number;
  employee_id: string;
  name: string;
  timestamp: number;
  synced: number; // 0 = Pending, 1 = Synced
  latitude?: number;
  longitude?: number;
  location_status?: string;
}

export class DatabaseService {
  private static instance: DatabaseService | null = null;
  private db: any = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize SQLite database and verify tables
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      Logger.info('Initializing SQLite database: nhai_facial_recognition.db');
      this.db = await SQLite.openDatabaseAsync('nhai_facial_recognition.db');

      // Enable foreign keys and set WAL mode
      await this.db.execAsync('PRAGMA foreign_keys = ON;');

      // Create employees table if not exists
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS employees (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          age INTEGER,
          phone TEXT,
          email TEXT,
          photo_path TEXT,
          embedding TEXT,
          timestamp INTEGER
        );
      `);

      // Create attendance table if not exists
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS attendance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id TEXT NOT NULL,
          name TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          synced INTEGER DEFAULT 0,
          latitude REAL,
          longitude REAL,
          location_status TEXT
        );
      `);
      
      try {
        await this.db.execAsync(`ALTER TABLE attendance ADD COLUMN latitude REAL;`);
        await this.db.execAsync(`ALTER TABLE attendance ADD COLUMN longitude REAL;`);
        await this.db.execAsync(`ALTER TABLE attendance ADD COLUMN location_status TEXT;`);
      } catch (e) {
        // Columns might already exist, ignore.
      }

      this.isInitialized = true;
      Logger.info('✓ SQLite Database and tables initialized successfully');
    } catch (error) {
      Logger.error('Failed to initialize SQLite Database', error);
      throw error;
    }
  }

  /**
   * Insert a new employee record
   */
  async insertEmployee(employee: Omit<Employee, 'timestamp'>): Promise<void> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Database not initialized');
    }

    const timestamp = Date.now();
    await this.db.runAsync(
      `INSERT INTO employees (id, name, age, phone, email, photo_path, embedding, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        employee.id,
        employee.name,
        employee.age,
        employee.phone,
        employee.email,
        employee.photo_path,
        employee.embedding,
        timestamp,
      ]
    );
    Logger.info(`Employee inserted in SQLite: ${employee.name} (${employee.id})`);
  }

  /**
   * Get all employee records
   */
  async getAllEmployees(): Promise<Employee[]> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Database not initialized');
    }

    return await this.db.getAllAsync(
      'SELECT * FROM employees ORDER BY name ASC;'
    );
  }

  /**
   * Get a single employee record by ID
   */
  async getEmployee(id: string): Promise<Employee | null> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Database not initialized');
    }

    const result = await this.db.getFirstAsync(
      'SELECT * FROM employees WHERE id = ?;',
      [id]
    );
    return (result as Employee) || null;
  }

  /**
   * Delete an employee record
   */
  async deleteEmployee(id: string): Promise<void> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Database not initialized');
    }

    // Since attendance has employee_id, it is good to delete attendance or keep it.
    // We will delete the employee.
    await this.db.runAsync('DELETE FROM employees WHERE id = ?;', [id]);
    Logger.info(`Employee deleted from SQLite: ${id}`);
  }

  /**
   * Log a new attendance record
   */
  async logAttendance(employeeId: string, name: string, lat?: number, lng?: number, locStatus?: string): Promise<void> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Database not initialized');
    }

    const timestamp = Date.now();
    await this.db.runAsync(
      `INSERT INTO attendance (employee_id, name, timestamp, synced, latitude, longitude, location_status) VALUES (?, ?, ?, 0, ?, ?, ?);`,
      [employeeId, name, timestamp, lat || null, lng || null, locStatus || null]
    );
    Logger.info(`Attendance logged for: ${name} (${employeeId}) [Loc: ${locStatus}]`);
  }

  /**
   * Get all attendance records
   */
  async getAttendanceLogs(): Promise<AttendanceRecord[]> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Database not initialized');
    }

    return await this.db.getAllAsync(
      'SELECT * FROM attendance ORDER BY timestamp DESC;'
    );
  }

  /**
   * Get all unsynced attendance records
   */
  async getUnsyncedAttendanceLogs(): Promise<AttendanceRecord[]> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Database not initialized');
    }

    return await this.db.getAllAsync(
      'SELECT * FROM attendance WHERE synced = 0 ORDER BY timestamp DESC;'
    );
  }

  /**
   * Mark specific attendance records as synced
   */
  async markAttendanceAsSynced(ids: number[]): Promise<void> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Database not initialized');
    }

    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(',');
    await this.db.runAsync(
      `UPDATE attendance SET synced = 1 WHERE id IN (${placeholders});`,
      ids
    );
    Logger.info(`Marked ${ids.length} attendance logs as synced`);
  }
}
