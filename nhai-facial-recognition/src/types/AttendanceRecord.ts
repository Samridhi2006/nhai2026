/**
 * types/AttendanceRecord.ts
 */
export interface AttendanceRecord {
  /** Auto-incremented SQLite primary key */
  id: number;

  employeeId: string;
  employeeName: string;

  /** ISO-8601 string of clock-in time */
  timestamp: string;

  /** 0–1: 1 − euclidean_distance. Higher is more confident. */
  confidence: number;
}
