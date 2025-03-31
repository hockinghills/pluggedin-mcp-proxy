import fs from 'fs';

/**
 * Defines the available logging levels.
 */
export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4
}

/**
 * Singleton Logger class for handling application logging.
 * Supports different log levels and optional logging to a file.
 * Reads configuration from environment variables:
 * - LOG_LEVEL: (NONE, ERROR, WARN, INFO, DEBUG) - defaults to ERROR
 * - LOG_TO_FILE: ('true' | 'false') - defaults to false
 * - LOG_FILE_PATH: (string) - path to the log file, required if LOG_TO_FILE is true.
 */
export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.ERROR;
  private logToFile: boolean = false;
  private logFilePath: string | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Gets the singleton instance of the Logger.
   * Initializes the logger based on environment variables on first call.
   * @returns The singleton Logger instance.
   */
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

  /**
   * Sets the logging level dynamically.
   * @param level - The minimum log level to output.
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Logs a debug message if the current log level allows it.
   * @param message - The main log message.
   * @param args - Additional arguments to log (will be stringified).
   */
  debug(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.DEBUG) {
      this.log('DEBUG', message, ...args);
    }
  }

  /**
   * Logs an info message if the current log level allows it.
   * @param message - The main log message.
   * @param args - Additional arguments to log (will be stringified).
   */
  info(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.INFO) {
      this.log('INFO', message, ...args);
    }
  }

  /**
   * Logs a warning message if the current log level allows it.
   * @param message - The main log message.
   * @param args - Additional arguments to log (will be stringified).
   */
  warn(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.WARN) {
      this.log('WARN', message, ...args);
    }
  }

  /**
   * Logs an error message if the current log level allows it.
   * @param message - The main log message.
   * @param args - Additional arguments to log (will be stringified).
   */
  error(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.ERROR) {
      this.log('ERROR', message, ...args);
    }
  }

  /**
   * Internal log method that formats the message and handles output
   * to stderr and/or a file based on configuration.
   * @param level - The string representation of the log level (e.g., 'DEBUG').
   * @param message - The main log message.
   * @param args - Additional arguments.
   */
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
        // Use asynchronous appendFile for better performance
        fs.appendFile(this.logFilePath, logMessage + '\n', (err) => {
          if (err) {
            // Log the failure to stderr ONCE to avoid loops if stderr itself fails
            // Check loggedToFile flag inside the callback to ensure it reflects the attempt status
            if (!loggedToFile) {
              process.stderr.write(`[ERROR] Failed to write to log file '${this.logFilePath}': ${err}\n`);
              // Optionally disable file logging temporarily or permanently after repeated failures
            }
            // Ensure loggedToFile remains false if the async write fails
            loggedToFile = false;
          } else {
            // Only set loggedToFile to true if the async write succeeds
            loggedToFile = true;
          }

          // Fallback to stderr if file logging is disabled or failed (check *after* async operation)
          if (!loggedToFile) {
             process.stderr.write(logMessage + '\n');
          }
        });
        // Note: loggedToFile might not be immediately true here due to async nature.
        // The fallback logic is moved inside the callback.
      } catch (error) {
        // Catch synchronous errors during the setup of appendFile (less likely)
        process.stderr.write(`[ERROR] Synchronous error setting up log file write for '${this.logFilePath}': ${error}\n`);
        loggedToFile = false; // Ensure fallback if setup fails
        // Fallback immediately if synchronous setup fails
        process.stderr.write(logMessage + '\n');
      }
    } else {
      // If file logging is not enabled from the start, log directly to stderr
      process.stderr.write(logMessage + '\n');
    }

    // IMPORTANT: The original fallback logic outside the 'if (this.logToFile...)' block
    // is removed because the fallback is now handled within the async callback
    // or immediately if file logging wasn't enabled/setup failed synchronously.
    // // Fallback to stderr if file logging is disabled or failed
    // if (!loggedToFile) {
    //    process.stderr.write(logMessage + '\n');
    // }

    // Fallback to stderr if file logging is disabled or failed
    if (!loggedToFile) {
       process.stderr.write(logMessage + '\n');
    }
  }
}

// Export a singleton instance
export const logger = Logger.getInstance();
