import type { Page, Response } from 'playwright';
import { logWarn, logDebug } from './logger.js';

export interface BanSignals {
  captchaDetected: boolean;
  httpError: number | null;
  unexpectedRedirect: boolean;
  contentMissing: boolean;
  jsChallenge: boolean;
  responseTimeMs: number;
  blockedUrl: string | null;
}

const CAPTCHA_SELECTORS = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="captcha"]',
  'iframe[src*="hcaptcha"]',
  '#captcha',
  '.g-recaptcha',
  '.h-captcha',
  '[data-sitekey]',
];

const JS_CHALLENGE_INDICATORS = [
  'Checking your browser',
  'Please wait',
  'Just a moment',
  'Verify you are human',
  'DDoS protection by',
];

const BLOCK_PAGE_PATTERNS = [
  '/error',
  '/block',
  '/access-denied',
  '/forbidden',
];

export async function detectBanSignals(
  page: Page,
  startTime: number,
  expectedUrl: string
): Promise<BanSignals> {
  const signals: BanSignals = {
    captchaDetected: false,
    httpError: null,
    unexpectedRedirect: false,
    contentMissing: false,
    jsChallenge: false,
    responseTimeMs: Date.now() - startTime,
    blockedUrl: null,
  };

  // Check for CAPTCHA
  for (const selector of CAPTCHA_SELECTORS) {
    const element = await page.$(selector);
    if (element) {
      signals.captchaDetected = true;
      logWarn('CAPTCHA detected', { selector });
      break;
    }
  }

  // Check for JavaScript challenge
  const pageContent = await page.content();
  for (const indicator of JS_CHALLENGE_INDICATORS) {
    if (pageContent.includes(indicator)) {
      signals.jsChallenge = true;
      logWarn('JS challenge detected', { indicator });
      break;
    }
  }

  // Check for unexpected redirect to block page
  const currentUrl = page.url();
  for (const pattern of BLOCK_PAGE_PATTERNS) {
    if (currentUrl.includes(pattern)) {
      signals.unexpectedRedirect = true;
      signals.blockedUrl = currentUrl;
      logWarn('Redirected to block page', { currentUrl, expectedUrl });
      break;
    }
  }

  // Check if we're on a completely different domain (suspicious redirect)
  const expectedDomain = new URL(expectedUrl).hostname;
  const currentDomain = new URL(currentUrl).hostname;
  if (expectedDomain !== currentDomain && !currentDomain.includes(expectedDomain)) {
    signals.unexpectedRedirect = true;
    signals.blockedUrl = currentUrl;
    logWarn('Domain mismatch', { expected: expectedDomain, current: currentDomain });
  }

  return signals;
}

export function setupResponseMonitor(page: Page): { getHttpError: () => number | null } {
  let lastHttpError: number | null = null;

  page.on('response', (response: Response) => {
    const status = response.status();
    if ([403, 429, 503, 520, 521, 522, 523, 524].includes(status)) {
      lastHttpError = status;
      logWarn('HTTP error detected', { status, url: response.url() });
    }
  });

  return {
    getHttpError: () => lastHttpError,
  };
}

export async function checkContentPresence(
  page: Page,
  selectors: string[]
): Promise<boolean> {
  for (const selector of selectors) {
    const element = await page.$(selector);
    if (element) {
      const text = await element.textContent();
      if (text && text.trim().length > 0) {
        logDebug('Content found', { selector });
        return true;
      }
    }
  }
  return false;
}

export function isBanned(signals: BanSignals): boolean {
  return (
    signals.captchaDetected ||
    signals.httpError !== null ||
    signals.unexpectedRedirect ||
    signals.jsChallenge
  );
}

export function getBanReason(signals: BanSignals): string | null {
  if (signals.captchaDetected) return 'CAPTCHA';
  if (signals.httpError !== null) return `HTTP ${signals.httpError}`;
  if (signals.jsChallenge) return 'JS Challenge';
  if (signals.unexpectedRedirect) return `Redirect to ${signals.blockedUrl}`;
  return null;
}
