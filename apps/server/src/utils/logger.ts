"use strict";
/**
 * Professional logging utility for Wtrops.ai platform
 * Provides structured logging with different log levels and environment awareness
 * Writes to both console and daily-rotating log files (logs/server-YYYY-MM-DD.log)
 *
 * @module logger
 */

import { DailyFileTransport } from "@wtrops/core";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogMessage {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  source?: string;
}

/**
 * Logger class for structured application logging
 * Supports multiple log levels and environment-aware output
 */
class Logger {
  private isDevelopment: boolean;
  private logLevel: LogLevel;
  private fileTransport: DailyFileTransport;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== "production";
    this.logLevel = this.getLogLevel();
    this.fileTransport = new DailyFileTransport("server");
  }

  /**
   * Determines the appropriate log level based on environment
   * @returns {LogLevel} The configured log level
   */
  private getLogLevel(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    if (
      envLevel === "debug" ||
      envLevel === "info" ||
      envLevel === "warn" ||
      envLevel === "error"
    ) {
      return envLevel;
    }
    return this.isDevelopment ? "debug" : "info";
  }

  /**
   * Formats timestamp for log output
   * @returns {string} Formatted timestamp
   */
  private getTimestamp(): string {
    return new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  }

  /**
   * Determines if a log should be output based on current log level
   * @param {LogLevel} level - The level of the log message
   * @returns {boolean} Whether the log should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  /**
   * Formats and outputs a log message
   * @param {LogLevel} level - The severity level
   * @param {string} message - The log message
   * @param {any} data - Optional data to log
   * @param {string} source - Optional source identifier
   */
  private log(
    level: LogLevel,
    message: string,
    data?: any,
    source?: string,
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const logMessage: LogMessage = {
      timestamp: this.getTimestamp(),
      level,
      message,
      data,
      source,
    };

    const formattedMessage = this.isDevelopment
      ? this.formatDevelopmentLog(logMessage)
      : this.formatProductionLog(logMessage);

    switch (level) {
      case "error":
        console.error(formattedMessage);
        break;
      case "warn":
        console.warn(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }

    // Always write JSON format to log file (structured, parseable)
    this.fileTransport.write(this.formatFileLog(logMessage));
  }

  /**
   * Formats log message for development environment
   * @param {LogMessage} logMessage - The log message object
   * @returns {string} Formatted log string
   */
  private formatDevelopmentLog(logMessage: LogMessage): string {
    const { timestamp, level, message, data, source } = logMessage;
    const levelPrefix = {
      debug: "[DEBUG]",
      info: "[INFO] ",
      warn: "[WARN] ",
      error: "[ERROR]",
    };

    let formatted = `${timestamp} ${levelPrefix[level]}`;
    if (source) {
      formatted += ` [${source}]`;
    }
    formatted += ` ${message}`;

    if (data !== undefined) {
      formatted += `\n${JSON.stringify(data, null, 2)}`;
    }

    return formatted;
  }

  /**
   * Formats log message for production environment
   * @param {LogMessage} logMessage - The log message object
   * @returns {string} JSON formatted log string
   */
  private formatProductionLog(logMessage: LogMessage): string {
    return JSON.stringify(logMessage);
  }

  /**
   * Formats log message for file output (always JSON with ISO timestamp)
   */
  private formatFileLog(logMessage: LogMessage): string {
    return JSON.stringify({
      ...logMessage,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log debug message (development only)
   * @param {string} message - The debug message
   * @param {any} data - Optional data
   * @param {string} source - Optional source
   */
  debug(message: string, data?: any, source?: string): void {
    this.log("debug", message, data, source);
  }

  /**
   * Log info message
   * @param {string} message - The info message
   * @param {any} data - Optional data
   * @param {string} source - Optional source
   */
  info(message: string, data?: any, source?: string): void {
    this.log("info", message, data, source);
  }

  /**
   * Log warning message
   * @param {string} message - The warning message
   * @param {any} data - Optional data
   * @param {string} source - Optional source
   */
  warn(message: string, data?: any, source?: string): void {
    this.log("warn", message, data, source);
  }

  /**
   * Log error message
   * @param {string} message - The error message
   * @param {any} error - Optional error object or data
   * @param {string} source - Optional source
   */
  error(message: string, error?: any, source?: string): void {
    this.log("error", message, error, source);
  }

  /**
   * Log HTTP request/response
   * @param {string} method - HTTP method
   * @param {string} path - Request path
   * @param {number} statusCode - Response status code
   * @param {number} duration - Request duration in ms
   * @param {any} response - Optional response data
   */
  http(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    response?: any,
  ): void {
    if (path.startsWith("/api")) {
      let logLine = `${method} ${path} ${statusCode} in ${duration}ms`;
      if (response && this.isDevelopment) {
        const responseStr = JSON.stringify(response);
        if (responseStr.length > 80) {
          logLine += ` :: ${responseStr.slice(0, 79)}…`;
        } else {
          logLine += ` :: ${responseStr}`;
        }
      }
      this.info(logLine, undefined, "HTTP");
    }
  }
}

// Export singleton instance
export const logger = new Logger();
