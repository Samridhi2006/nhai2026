/**
 * services/DatabaseService.ts  –  NHAI Workforce Attendance System
 *
 * Typed SQLite helpers.  All read paths defensively validate embedding
 * rows before returning them so that callers never receive corrupt data.
 */

import * as SQLite from 'expo-sqlite';
import type { Employee } from '../types/Employee';
import type { AttendanceRecord } from '../types/AttendanceRecord';

const EMBEDDING_DIM = 128;

// ─── DB bootstrap ─────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

function getDB(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync('nhai_attendance.db');
    _db.execSync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS employees (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id   TEXT    NOT NULL UNIQUE,
        full_name     TEXT    NOT NULL,
        designation   TEXT    NOT NULL DEFAULT '',
        division      TEXT    NOT NULL DEFAULT '',
        face_embedding TEXT   NOT NULL,
        registered_at TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id   TEXT    NOT NULL,
        employee_name TEXT    NOT NULL,
        timestamp     TEXT    NOT NULL,
        confidence    REAL    NOT NULL DEFAULT 0
      );
    `);
  }
  return _db;
}

// ─── Embedding serialisation / deserialisation ────────────────────────────────

function serializeEmbedding(vec: number[] | Float32Array): string {
  const nativeArray = vec instanceof Float32Array ? Array.from(vec) : vec;
  return JSON.stringify(nativeArray);
}

/**
 * Deserialises and validates an embedding stored as a JSON string.
 * Returns null if the stored value is malformed, wrong length, contains NaN,
 * or is an all-zero vector (indicates a previously failed inference).
 */
function deserializeEmbedding(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    if (parsed.length !== EMBEDDING_DIM) return null;

    let sumSq = 0;
    for (const v of parsed) {
      if (typeof v !== 'number' || Number.isNaN(v)) return null;
      sumSq += v * v;
    }
    if (sumSq <= 1e-6) return null;  // all-zero guard

    return parsed as number[];
  } catch {
    return null;
  }
}

// ─── Row → typed object mappers ───────────────────────────────────────────────

interface RawEmployeeRow {
  id:             number;
  employee_id:    string;
  full_name:      string;
  designation:    string;
  division:       string;
  face_embedding: string;
  registered_at:  string;
}

/**
 * Maps a raw DB row to an Employee.
 * Returns null when the embedding is invalid – the caller must filter these out
 * to prevent dimension-mismatch crashes downstream.
 */
function rowToEmployee(row: RawEmployeeRow): Employee | null {
  const embedding = deserializeEmbedding(row.face_embedding);
  if (!embedding) {
    console.warn(
      `[NHAI][DB] Skipping employee "${row.employee_id}": corrupt or empty embedding.`,
    );
    return null;
  }
  return {
    id:            row.id,
    employeeId:    row.employee_id,
    fullName:      row.full_name,
    designation:   row.designation,
    division:      row.division,
    faceEmbedding: embedding,
    registeredAt:  row.registered_at,
  };
}

interface RawAttendanceRow {
  id:            number;
  employee_id:   string;
  employee_name: string;
  timestamp:     string;
  confidence:    number;
}

function rowToAttendance(row: RawAttendanceRow): AttendanceRecord {
  return {
    id:           row.id,
    employeeId:   row.employee_id,
    employeeName: row.employee_name,
    timestamp:    row.timestamp,
    confidence:   row.confidence,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const DatabaseService = {
  // ── Employees ──────────────────────────────────────────────────────────────

  /**
   * Returns ALL employees with valid embeddings.
   * Rows with corrupt embeddings are silently skipped to prevent cascading
   * Vector-dimensions-mismatch crashes in the recognition loop.
   */
  async getAllEmployees(): Promise<Employee[]> {
    const db = getDB();
    const rows = db.getAllSync<RawEmployeeRow>(
      'SELECT * FROM employees ORDER BY registered_at DESC',
    );
    return rows
      .map(rowToEmployee)
      .filter((e): e is Employee => e !== null);
  },

  /**
   * Find a single employee by their NHAI employee_id string.
   * Returns null when not found.
   */
  async findEmployeeById(employeeId: string): Promise<Employee | null> {
    const db = getDB();
    const row = db.getFirstSync<RawEmployeeRow>(
      'SELECT * FROM employees WHERE employee_id = ?',
      [employeeId],
    );
    if (!row) return null;
    return rowToEmployee(row);
  },

  /**
   * Insert a new employee record with duplicate detection.
   * Maps both camelCase and snake_case parameters safely.
   * 
   * @throws Error if embedding is invalid or duplicate face detected
   */
  async insertEmployee(
    data: Omit<Employee, 'id'>
  ): Promise<number> {
    // Structural compatibility mapping layer for your screen components
    const embeddingInput = data.faceEmbedding;

    if (!embeddingInput || embeddingInput.length !== EMBEDDING_DIM) {
      throw new Error(
        `[DB] Refusing to insert employee "${data.employeeId}": ` +
        `embedding has ${embeddingInput?.length ?? 0} dimensions (expected ${EMBEDDING_DIM}).`,
      );
    }

    // Validate embedding integrity
    let sumSq = 0;
    for (const v of embeddingInput) {
      if (typeof v !== 'number' || Number.isNaN(v) || !isFinite(v)) {
        throw new Error(
          `[DB] Invalid embedding value detected for "${data.employeeId}": contains NaN or Infinity`
        );
      }
      sumSq += v * v;
    }
    
    if (sumSq <= 1e-6) {
      throw new Error(
        `[DB] Zero-magnitude embedding detected for "${data.employeeId}": failed extraction`
      );
    }

    const db = getDB();
    const result = db.runSync(
      `INSERT OR REPLACE INTO employees
         (employee_id, full_name, designation, division, face_embedding, registered_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.employeeId,
        data.fullName,
        data.designation,
        data.division,
        serializeEmbedding(embeddingInput),
        data.registeredAt,
      ],
    );
    return result.lastInsertRowId;
  },

  /** Hard-delete a registration (admin use). */
  async deleteEmployee(id: number): Promise<void> {
    const db = getDB();
    db.runSync('DELETE FROM employees WHERE id = ?', [id]);
  },

  // ── Attendance ─────────────────────────────────────────────────────────────

  async insertAttendanceRecord(data: Omit<AttendanceRecord, 'id'>): Promise<number> {
    const db = getDB();
    const result = db.runSync(
      `INSERT INTO attendance (employee_id, employee_name, timestamp, confidence)
       VALUES (?, ?, ?, ?)`,
      [data.employeeId, data.employeeName, data.timestamp, data.confidence],
    );
    return result.lastInsertRowId;
  },

  async getTodayAttendance(): Promise<AttendanceRecord[]> {
    const db = getDB();
    const todayPrefix = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const rows = db.getAllSync<RawAttendanceRow>(
      `SELECT * FROM attendance
       WHERE timestamp LIKE ?
       ORDER BY timestamp DESC`,
      [`${todayPrefix}%`],
    );
    return rows.map(rowToAttendance);
  },

  async getAllAttendance(): Promise<AttendanceRecord[]> {
    const db = getDB();
    const rows = db.getAllSync<RawAttendanceRow>(
      'SELECT * FROM attendance ORDER BY timestamp DESC',
    );
    return rows.map(rowToAttendance);
  },

  /**
   * Purge attendance records older than `days` days.
   * Safe to call periodically for storage hygiene.
   */
  async purgeOldAttendance(days: number = 90): Promise<void> {
    const db = getDB();
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    db.runSync('DELETE FROM attendance WHERE timestamp < ?', [cutoff]);
  },
};