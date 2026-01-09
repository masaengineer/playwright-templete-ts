import winston from 'winston';
import path from 'path';
import { config } from './config.js';

export interface RequestLog {
  timestamp: string;
  requestId: string;
  config: {
    ipType: string;
    proxyProvider?: string;
    headless: boolean;
    stealthEnabled: boolean;
    humanBehaviorPattern: string;
  };
  request: {
    url: string;
    method: string;
    intervalSinceLastMs?: number;
  };
  response: {
    statusCode: number;
    loadTimeMs: number;
    contentLength?: number;
  };
  banSignals: {
    captchaDetected: boolean;
    httpError: number | null;
    unexpectedRedirect: boolean;
    contentMissing: boolean;
    jsChallenge: boolean;
  };
  scrapedData?: {
    titleExtracted: boolean;
    priceExtracted: boolean;
    soldStatusExtracted: boolean;
  };
  session: {
    sessionId: string;
    requestCountInSession: number;
    sessionDurationMinutes: number;
  };
}

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: path.join(config.logging.outputDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(config.logging.outputDir, 'combined.log'),
    }),
    new winston.transports.File({
      filename: path.join(config.logging.outputDir, 'requests.jsonl'),
      level: 'info',
    }),
  ],
});

export function logRequest(log: RequestLog): void {
  logger.info('request', log);
}

export function logInfo(message: string, meta?: Record<string, unknown>): void {
  logger.info(message, meta);
}

export function logError(message: string, error?: Error, meta?: Record<string, unknown>): void {
  logger.error(message, { error: error?.message, stack: error?.stack, ...meta });
}

export function logWarn(message: string, meta?: Record<string, unknown>): void {
  logger.warn(message, meta);
}

export function logDebug(message: string, meta?: Record<string, unknown>): void {
  logger.debug(message, meta);
}

export function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function generateSessionId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export default logger;
