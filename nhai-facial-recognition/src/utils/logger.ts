/**
 * Structured Logging Service
 */

enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  level: LogLevel;
  timestamp: number;
  message: string;
  data?: any;
}

export class Logger {
  private static logs: LogEntry[] = [];
  private static maxLogs = 1000;

  private static log(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      level,
      timestamp: Date.now(),
      message,
      data,
    };

    Logger.logs.push(entry);

    // Keep only recent logs
    if (Logger.logs.length > Logger.maxLogs) {
      Logger.logs.shift();
    }

    // Console output
    const prefix = `[${level}] [NHAI]`;
    switch (level) {
      case LogLevel.DEBUG:
        console.log(prefix, message, data);
        break;
      case LogLevel.INFO:
        console.log(prefix, message, data);
        break;
      case LogLevel.WARN:
        console.warn(prefix, message, data);
        break;
      case LogLevel.ERROR:
        console.error(prefix, message, data);
        break;
    }
  }

  static debug(message: string, data?: any) {
    Logger.log(LogLevel.DEBUG, message, data);
  }

  static info(message: string, data?: any) {
    Logger.log(LogLevel.INFO, message, data);
  }

  static warn(message: string, data?: any) {
    Logger.log(LogLevel.WARN, message, data);
  }

  static error(message: string, data?: any) {
    Logger.log(LogLevel.ERROR, message, data);
  }

  static logInference(model: string, latency: number, success: boolean, data?: any) {
    Logger.info(`Inference [${model}]`, {
      latency_ms: latency,
      success,
      ...data,
    });
  }

  static logAttendance(faceId: string, confidence: number, data?: any) {
    Logger.info('Attendance recorded', {
      faceId,
      confidence,
      timestamp: Date.now(),
      ...data,
    });
  }

  static getLogs(): LogEntry[] {
    return [...Logger.logs];
  }

  static clearLogs() {
    Logger.logs = [];
  }
}
