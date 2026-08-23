// src/utils/logger.ts

enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
  DEBUG = 'DEBUG',
}

class Logger {
  static info(message: string): void {
    console.log(`\x1b[36m[${LogLevel.INFO}]\x1b[0m ${message}`);
  }

  static warn(message: string): void {
    console.warn(`\x1b[33m[${LogLevel.WARN}]\x1b[0m ${message}`);
  }

  static error(message: string, error?: Error | unknown): void {
    console.error(`\x1b[31m[${LogLevel.ERROR}]\x1b[0m ${message}`);
    if (error) {
      console.error(error instanceof Error ? error.stack : error);
    }
  }

  static success(message: string): void {
    console.log(`\x1b[32m[${LogLevel.SUCCESS}]\x1b[0m ${message}`);
  }

  static debug(message: string): void {
    if (process.env.DEBUG === 'true') {
      console.debug(`\x1b[90m[${LogLevel.DEBUG}]\x1b[0m ${message}`);
    }
  }
}

export default Logger;