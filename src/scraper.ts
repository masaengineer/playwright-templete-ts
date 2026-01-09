import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext, Page } from 'playwright';
import { config, ScraperConfig, FingerprintConfig } from './config.js';
import { detectBanSignals, setupResponseMonitor, isBanned, getBanReason, BanSignals } from './ban-detector.js';
import { applyHumanBehavior } from './human-behavior.js';
import { logInfo, logError, logRequest, generateRequestId, generateSessionId, RequestLog } from './logger.js';

// Apply stealth plugin
if (config.stealthEnabled) {
  chromium.use(StealthPlugin());
}

export interface ScrapeResult<T> {
  success: boolean;
  data?: T;
  banSignals: BanSignals;
  error?: string;
}

export abstract class BaseScraper {
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected config: ScraperConfig;
  protected sessionId: string;
  protected requestCount: number = 0;
  protected sessionStartTime: number;
  protected lastRequestTime: number = 0;

  constructor(customConfig?: Partial<ScraperConfig>) {
    this.config = { ...config, ...customConfig };
    this.sessionId = generateSessionId();
    this.sessionStartTime = Date.now();
  }

  async initialize(): Promise<void> {
    logInfo('Initializing scraper', {
      sessionId: this.sessionId,
      headless: this.config.headless,
      stealthEnabled: this.config.stealthEnabled,
      humanBehaviorPattern: this.config.humanBehavior.pattern,
    });

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: this.config.headless,
    };

    if (this.config.proxy) {
      launchOptions.proxy = {
        server: this.config.proxy.server,
        username: this.config.proxy.username,
        password: this.config.proxy.password,
      };
    }

    this.browser = await chromium.launch(launchOptions);
    await this.createContext(this.config.fingerprint);
  }

  protected async createContext(fingerprint: FingerprintConfig): Promise<void> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    this.context = await this.browser.newContext({
      userAgent: fingerprint.userAgent,
      locale: fingerprint.locale,
      timezoneId: fingerprint.timezoneId,
      geolocation: fingerprint.geolocation,
      permissions: fingerprint.geolocation ? ['geolocation'] : [],
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });

    this.page = await this.context.newPage();
  }

  async navigate(url: string): Promise<ScrapeResult<void>> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const requestId = generateRequestId();
    const startTime = Date.now();
    const intervalSinceLastMs = this.lastRequestTime > 0 ? startTime - this.lastRequestTime : undefined;

    const responseMonitor = setupResponseMonitor(this.page);

    try {
      await this.page.goto(url, { waitUntil: 'networkidle' });

      // Apply human behavior if enabled
      if (this.config.humanBehavior.enabled) {
        await applyHumanBehavior(this.page, this.config.humanBehavior);
      }

      const banSignals = await detectBanSignals(this.page, startTime, url);
      banSignals.httpError = responseMonitor.getHttpError();

      this.requestCount++;
      this.lastRequestTime = Date.now();

      // Log request
      if (this.config.logging.enabled) {
        const log: RequestLog = {
          timestamp: new Date().toISOString(),
          requestId,
          config: {
            ipType: this.config.proxy ? 'proxy' : 'direct',
            proxyProvider: this.config.proxy?.server,
            headless: this.config.headless,
            stealthEnabled: this.config.stealthEnabled,
            humanBehaviorPattern: this.config.humanBehavior.pattern,
          },
          request: {
            url,
            method: 'GET',
            intervalSinceLastMs,
          },
          response: {
            statusCode: banSignals.httpError || 200,
            loadTimeMs: banSignals.responseTimeMs,
          },
          banSignals: {
            captchaDetected: banSignals.captchaDetected,
            httpError: banSignals.httpError,
            unexpectedRedirect: banSignals.unexpectedRedirect,
            contentMissing: banSignals.contentMissing,
            jsChallenge: banSignals.jsChallenge,
          },
          session: {
            sessionId: this.sessionId,
            requestCountInSession: this.requestCount,
            sessionDurationMinutes: (Date.now() - this.sessionStartTime) / 60000,
          },
        };
        logRequest(log);
      }

      if (isBanned(banSignals)) {
        return {
          success: false,
          banSignals,
          error: `BAN detected: ${getBanReason(banSignals)}`,
        };
      }

      return { success: true, banSignals };
    } catch (error) {
      const banSignals: BanSignals = {
        captchaDetected: false,
        httpError: null,
        unexpectedRedirect: false,
        contentMissing: true,
        jsChallenge: false,
        responseTimeMs: Date.now() - startTime,
        blockedUrl: null,
      };

      logError('Navigation failed', error as Error, { url, requestId });

      return {
        success: false,
        banSignals,
        error: (error as Error).message,
      };
    }
  }

  protected async extractText(selector: string): Promise<string | null> {
    if (!this.page) return null;
    const element = await this.page.$(selector);
    if (!element) return null;
    return element.textContent();
  }

  protected async extractAttribute(selector: string, attribute: string): Promise<string | null> {
    if (!this.page) return null;
    const element = await this.page.$(selector);
    if (!element) return null;
    return element.getAttribute(attribute);
  }

  async close(): Promise<void> {
    logInfo('Closing scraper', {
      sessionId: this.sessionId,
      totalRequests: this.requestCount,
      sessionDurationMinutes: (Date.now() - this.sessionStartTime) / 60000,
    });

    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  abstract scrape(url: string): Promise<ScrapeResult<unknown>>;
}
