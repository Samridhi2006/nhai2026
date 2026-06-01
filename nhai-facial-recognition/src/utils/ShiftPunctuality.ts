/**
 * ShiftPunctuality.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * NHAI Shift Punctuality Evaluation Engine
 *
 * Implements attendance classification per National Highways Authority of India
 * operational shift guidelines.
 *
 * SHIFT WINDOWS
 * ─────────────
 *   Morning   Shift : 06:00 – 14:00
 *   Afternoon Shift : 14:00 – 22:00
 *   Night     Shift : 22:00 – 06:00  (crosses midnight)
 *
 * ON-TIME BUFFER
 * ──────────────
 *   Workers have a 15-minute grace window after shift start before being
 *   flagged as Late.  The exact minutes late are recorded in minutesDeviated
 *   so supervisors can distinguish a 2-minute slip from a 2-hour absence.
 *
 * USAGE
 * ─────
 *   // Detect shift from clock-in time alone (most common):
 *   const result = ShiftPunctuality.evaluate(Date.now());
 *
 *   // Validate against a pre-assigned shift:
 *   const result = ShiftPunctuality.evaluate(Date.now(), 'MORNING');
 *
 *   // Then persist directly:
 *   await db.logAttendance(empId, name, lat, lng, locStatus,
 *                          result.currentShift, result.status, result.minutesDeviated);
 */

// ─── Public Types ─────────────────────────────────────────────────────────────

/** The three NHAI operational shifts */
export type ShiftName = 'MORNING' | 'AFTERNOON' | 'NIGHT';

/** Attendance punctuality classification */
export type PunctualityStatus = 'ON_TIME' | 'LATE' | 'EARLY';

/** Structured result returned by evaluate() */
export interface PunctualityResult {
  /** Canonical shift name: e.g. "Morning Shift" */
  currentShift:    string;

  /** Machine-readable status enum */
  status:          PunctualityStatus;

  /**
   * Positive = minutes late.
   * Negative = minutes early (before shift window opens).
   * Zero     = exactly on time.
   */
  minutesDeviated: number;

  /** User-friendly message suitable for display or push notification */
  message:         string;

  /** The exact shift start time as an ISO-8601 string (same calendar day) */
  shiftStartISO:   string;

  /** The exact shift end time as an ISO-8601 string */
  shiftEndISO:     string;
}

// ─── Configuration ────────────────────────────────────────────────────────────

/** Minutes after shift start that are still considered On-Time (NHAI standard) */
const ON_TIME_BUFFER_MINUTES = 15;

/**
 * If a worker checks in more than this many minutes BEFORE shift start they
 * are classified as EARLY (prevents midnight-shift workers being flagged early
 * for scanning at 05:58).
 */
const EARLY_THRESHOLD_MINUTES = 60;

// ─── Internal Shift Definitions ──────────────────────────────────────────────

interface ShiftDefinition {
  key:        ShiftName;
  label:      string;     // Display name
  startHour:  number;     // 0–23
  startMin:   number;
  endHour:    number;
  endMin:     number;
  crossesMidnight: boolean;
}

const SHIFTS: ShiftDefinition[] = [
  { key:'MORNING',   label:'Morning Shift',   startHour:6,  startMin:0, endHour:14, endMin:0,  crossesMidnight:false },
  { key:'AFTERNOON', label:'Afternoon Shift', startHour:14, startMin:0, endHour:22, endMin:0,  crossesMidnight:false },
  { key:'NIGHT',     label:'Night Shift',     startHour:22, startMin:0, endHour:6,  endMin:0,  crossesMidnight:true  },
];

// ─── Core Engine ─────────────────────────────────────────────────────────────

export const ShiftPunctuality = {

  /**
   * Primary evaluation function.
   *
   * @param checkInTimestamp  Unix ms timestamp of the check-in event.
   * @param assignedShift     Optional pre-assigned shift. If omitted the shift
   *                          is auto-detected from the check-in time.
   * @returns PunctualityResult
   *
   * INTEGRATION EXAMPLE (DatabaseService.logAttendance)
   * ────────────────────────────────────────────────────
   *   const p = ShiftPunctuality.evaluate(Date.now());
   *   await db.logAttendance(
   *     empId, name, lat, lng, locStatus,
   *     p.currentShift,          // shift_name column
   *     p.status === 'LATE' ? 'Late' : 'Present',  // status column
   *     p.minutesDeviated        // minutes_late column (optional)
   *   );
   */
  evaluate(
    checkInTimestamp: number,
    assignedShift?: ShiftName
  ): PunctualityResult {
    const checkIn = new Date(checkInTimestamp);

    // ── Determine which shift to evaluate against ──────────────────────────
    const shift = assignedShift
      ? SHIFTS.find(s => s.key === assignedShift)!
      : detectShiftFromTime(checkIn);

    // ── Compute shift-start and shift-end Date objects ─────────────────────
    const { shiftStart, shiftEnd } = buildShiftBoundaries(shift, checkIn);

    // ── Minutes difference: positive = late, negative = early ─────────────
    const diffMs      = checkIn.getTime() - shiftStart.getTime();
    const diffMinutes = Math.round(diffMs / 60_000);

    // ── Classify ───────────────────────────────────────────────────────────
    let status: PunctualityStatus;
    let message: string;

    if (diffMinutes < -EARLY_THRESHOLD_MINUTES) {
      // Checked in far too early — possibly wrong shift
      status  = 'EARLY';
      message = `Early by ${Math.abs(diffMinutes)} minutes — ${shift.label} starts at ${formatTime(shiftStart)}`;
    } else if (diffMinutes <= ON_TIME_BUFFER_MINUTES) {
      // Within the 15-minute grace window (includes negative = a few minutes early)
      status  = 'ON_TIME';
      const minEarly = diffMinutes < 0 ? Math.abs(diffMinutes) : 0;
      message = diffMinutes <= 0
        ? `On Time — ${minEarly > 0 ? `${minEarly}min early, ` : ''}${shift.label}`
        : `On Time — ${diffMinutes} min after start (within ${ON_TIME_BUFFER_MINUTES}-min buffer)`;
    } else {
      // Past the grace window — definitely Late
      status  = 'LATE';
      message = `Late by ${diffMinutes} minutes — ${shift.label} started at ${formatTime(shiftStart)}`;
    }

    return {
      currentShift:    shift.label,
      status,
      minutesDeviated: diffMinutes,
      message,
      shiftStartISO:   shiftStart.toISOString(),
      shiftEndISO:     shiftEnd.toISOString(),
    };
  },

  /**
   * Returns the current active shift name for a given timestamp.
   * Useful for populating UI labels without a full evaluation.
   */
  getCurrentShiftName(ts = Date.now()): string {
    return detectShiftFromTime(new Date(ts)).label;
  },

  /**
   * Human-readable summary — useful for local notifications.
   * e.g. "✅ On Time — Morning Shift" or "⏰ Late by 23 min — Night Shift"
   */
  formatResult(r: PunctualityResult): string {
    switch (r.status) {
      case 'ON_TIME': return `✅ On Time — ${r.currentShift}`;
      case 'LATE':    return `⏰ Late by ${r.minutesDeviated} min — ${r.currentShift}`;
      case 'EARLY':   return `⏫ Early — ${r.currentShift} starts ${formatTime(new Date(r.shiftStartISO))}`;
    }
  },

  /**
   * Convert PunctualityResult.status to the 'Present' | 'Late' string your
   * existing DatabaseService attendance column uses.
   */
  toDBStatus(result: PunctualityResult): 'Present' | 'Late' {
    return result.status === 'LATE' ? 'Late' : 'Present';
  },
};

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Detect which shift a check-in time falls inside.
 * Falls back to MORNING if no shift contains the timestamp
 * (should not happen for valid clock readings).
 */
function detectShiftFromTime(d: Date): ShiftDefinition {
  const mins = d.getHours() * 60 + d.getMinutes();

  // Morning:   360 – 839  (06:00 – 13:59)
  if (mins >= 360 && mins < 840) return SHIFTS[0];
  // Afternoon: 840 – 1319 (14:00 – 21:59)
  if (mins >= 840 && mins < 1320) return SHIFTS[1];
  // Night:     1320 – 1439 + 0 – 359 (22:00 – 05:59 next day)
  return SHIFTS[2];
}

/**
 * Build concrete Date objects for shiftStart and shiftEnd relative to the
 * check-in day, handling the midnight crossover for Night Shift correctly.
 */
function buildShiftBoundaries(
  shift: ShiftDefinition,
  checkIn: Date
): { shiftStart: Date; shiftEnd: Date } {
  const year  = checkIn.getFullYear();
  const month = checkIn.getMonth();
  const day   = checkIn.getDate();

  let shiftStart = new Date(year, month, day, shift.startHour, shift.startMin, 0, 0);
  let shiftEnd   = new Date(year, month, day, shift.endHour,   shift.endMin,   0, 0);

  if (shift.crossesMidnight) {
    // Night shift: 22:00 today → 06:00 tomorrow
    shiftEnd = new Date(year, month, day + 1, shift.endHour, shift.endMin, 0, 0);

    // If worker checks in between 00:00–05:59, shift START was *yesterday* at 22:00
    if (checkIn.getHours() < 6) {
      shiftStart = new Date(year, month, day - 1, shift.startHour, shift.startMin, 0, 0);
      shiftEnd   = new Date(year, month, day,     shift.endHour,   shift.endMin,   0, 0);
    }
  }

  return { shiftStart, shiftEnd };
}

/** Format a Date as HH:MM (24-hour) */
function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
