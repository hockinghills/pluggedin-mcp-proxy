import fs from 'fs'; // Import fs for file logging

export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.ERROR; // Default to ERROR
  private logToFile: boolean = false;
  private logFilePath: string | null = null;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();

      // Set log level from environment (e.g., LOG_LEVEL=DEBUG)
      const envLogLevel = process.env.LOG_LEVEL?.toUpperCase();
      if (envLogLevel && envLogLevel in LogLevel) {
         // Check if the key exists in the enum before accessing it
         // Use type assertion carefully, ensuring envLogLevel is a valid key
         Logger.instance.logLevel = LogLevel[envLogLevel as keyof typeof LogLevel];
      } else if (envLogLevel) {
         process.stderr.write(`[WARN] Invalid LOG_LEVEL environment variable: ${process.env.LOG_LEVEL}. Defaulting to ERROR.\n`);
      }


      // Set file logging from environment
      Logger.instance.logToFile = process.env.LOG_TO_FILE === 'true';
      Logger.instance.logFilePath = process.env.LOG_FILE_PATH || null;

      if (Logger.instance.logToFile && !Logger.instance.logFilePath) {
        process.stderr.write(`[WARN] LOG_TO_FILE is true, but LOG_FILE_PATH is not set. Logging to stderr only.\n`);
        Logger.instance.logToFile = false; // Disable file logging if path is missing
      } else if (Logger.instance.logToFile && Logger.instance.logFilePath) {
         // Optional: Check if log file is writable on startup
         try {
            // Attempt a test write (or check permissions)
            fs.accessSync(Logger.instance.logFilePath, fs.constants.W_OK);
         } catch (err: any) {
            // Handle cases where the directory might not exist or permissions are wrong
            if (err.code === 'ENOENT') {
               try {
                  // Attempt to create the directory if it doesn't exist
                  const path = require('path');
                  fs.mkdirSync(path.dirname(Logger.instance.logFilePath), { recursive: true });
                  // Try accessing again after creating directory
                  fs.accessSync(Logger.instance.logFilePath, fs.constants.W_OK);
               } catch (mkdirErr) {
                  process.stderr.write(`[ERROR] Log file path directory does not exist and could not be created: ${mkdirErr}\n`);
                  process.stderr.write(`[WARN] Disabling file logging due to path issue.\n`);
                  Logger.instance.logToFile = false;
               }
            } else if (err.code === 'EACCES') {
               process.stderr.write(`[ERROR] Permission denied writing to log file: ${Logger.instance.logFilePath}\n`);
               process.stderr.write(`[WARN] Disabling file logging due to permissions.\n`);
               Logger.instance.logToFile = false;
            } else {
               process.stderr.write(`[ERROR] Error accessing log file path: ${err}\n`);
               process.stderr.write(`[WARN] Disabling file logging due to unknown error.\n`);
               Logger.instance.logToFile = false;
            }
         }
      }
    }
    return Logger.instance;
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  debug(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.DEBUG) {
      this.log('DEBUG', message, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.INFO) {
      this.log('INFO', message, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.WARN) {
      this.log('WARN', message, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.ERROR) {
      this.log('ERROR', message, ...args);
    }
  }

  private log(level: string, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    const logMessage = `[${timestamp}] [${level}] ${message} ${formattedArgs}`;

    // Log to stderr (won't interfere with stdout used for MCP communication)
    // Only log to stderr if file logging is disabled or fails
    let loggedToFile = false;
    if (this.logToFile && this.logFilePath) {
      try {
        // Use appendFileSync for simplicity, consider async for high volume
        fs.appendFileSync(this.logFilePath, logMessage + '\n');
        loggedToFile = true;
      } catch (error) {
        // Log the failure to stderr ONCE to avoid loops if stderr itself fails
        if (!loggedToFile) { // Prevent duplicate stderr logs if append fails
           process.stderr.write(`[ERROR] Failed to write to log file '${this.logFilePath}': ${error}\n`);
           // Optionally disable file logging temporarily or permanently after repeated failures
        }
      }
    }

    // Fallback to stderr if file logging is disabled or failed
    if (!loggedToFile) {
       process.stderr.write(logMessage + '\n');
    }
  }
}

// Export a singleton instance
export const logger = Logger.getInstance();
