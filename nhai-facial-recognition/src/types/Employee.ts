/**
 * types/Employee.ts
 * Central type definitions for the NHAI Attendance System.
 */

/**
 * A registered employee with an enrolled face embedding.
 * The `faceEmbedding` field stores the 128-dimensional MobileFaceNet vector
 * as a plain number array (serialised to JSON in SQLite).
 */
export interface Employee {
  /** Auto-incremented SQLite primary key */
  id: number;

  /** Human-readable NHAI employee identifier, e.g. "NHAI-2024-001" */
  employeeId: string;

  fullName:    string;
  designation: string;
  division:    string;

  /**
   * 128-element MobileFaceNet embedding.
   * INVARIANT: length === 128, no NaN, L2 norm > 0.
   * Rows that violate this invariant are ignored during recognition.
   */
  faceEmbedding: number[];

  /** ISO-8601 string */
  registeredAt: string;
}
