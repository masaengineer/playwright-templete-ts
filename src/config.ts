import dotenv from 'dotenv';

dotenv.config();

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export interface FingerprintConfig {
  userAgent: string;
  locale: string;
  timezoneId: string;
  geolocation?: {
    latitude: number;
    longitude: number;
  };
}

export interface ScraperConfig {
  headless: boolean;
  stealthEnabled: boolean;
  proxy?: ProxyConfig;
  fingerprint: FingerprintConfig;
  humanBehavior: {
    enabled: boolean;
    pattern: 'A' | 'B' | 'C'; // A: mechanical, B: basic, C: advanced
    minDelay: number;
    maxDelay: number;
  };
  logging: {
    enabled: boolean;
    level: 'debug' | 'info' | 'warn' | 'error';
    outputDir: string;
  };
}

// Default fingerprint for Japan region
const defaultJapanFingerprint: FingerprintConfig = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
  geolocation: {
    latitude: 35.6762,
    longitude: 139.6503,
  },
};

// US fingerprint for testing
export const usFingerprint: FingerprintConfig = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'en-US',
  timezoneId: 'America/New_York',
  geolocation: {
    latitude: 40.7128,
    longitude: -74.006,
  },
};

export function loadConfig(): ScraperConfig {
  const proxyServer = process.env.PROXY_SERVER;

  return {
    headless: process.env.HEADLESS !== 'false',
    stealthEnabled: process.env.STEALTH_ENABLED !== 'false',
    proxy: proxyServer ? {
      server: proxyServer,
      username: process.env.PROXY_USER,
      password: process.env.PROXY_PASS,
    } : undefined,
    fingerprint: defaultJapanFingerprint,
    humanBehavior: {
      enabled: process.env.HUMAN_BEHAVIOR_ENABLED !== 'false',
      pattern: (process.env.HUMAN_BEHAVIOR_PATTERN as 'A' | 'B' | 'C') || 'B',
      minDelay: parseInt(process.env.MIN_DELAY || '1000', 10),
      maxDelay: parseInt(process.env.MAX_DELAY || '5000', 10),
    },
    logging: {
      enabled: process.env.LOGGING_ENABLED !== 'false',
      level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
      outputDir: process.env.LOG_OUTPUT_DIR || './logs',
    },
  };
}

export const config = loadConfig();
