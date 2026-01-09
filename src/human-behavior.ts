import type { Page } from 'playwright';
import { logDebug } from './logger.js';

export interface HumanBehaviorOptions {
  pattern: 'A' | 'B' | 'C';
  minDelay: number;
  maxDelay: number;
}

// Generate random delay with optional normal distribution simulation
export async function randomDelay(
  page: Page,
  min: number = 1000,
  max: number = 5000
): Promise<void> {
  // Use Box-Muller transform for more human-like distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  // Map normal distribution to our range (mean at center, std of 0.2)
  const normalized = (normal * 0.2 + 0.5);
  const clamped = Math.max(0, Math.min(1, normalized));
  const delay = min + clamped * (max - min);

  logDebug('Random delay', { delay: Math.round(delay) });
  await page.waitForTimeout(Math.round(delay));
}

// Human-like scrolling
export async function humanScroll(page: Page): Promise<void> {
  const scrollCount = Math.floor(Math.random() * 3) + 2;
  logDebug('Starting human scroll', { scrollCount });

  for (let i = 0; i < scrollCount; i++) {
    const scrollAmount = Math.random() * 300 + 100;
    await page.mouse.wheel(0, scrollAmount);
    await randomDelay(page, 300, 800);
  }

  // Sometimes scroll back up a bit
  if (Math.random() > 0.7) {
    const scrollBack = -(Math.random() * 100 + 50);
    await page.mouse.wheel(0, scrollBack);
    await randomDelay(page, 200, 500);
  }
}

// Bezier curve mouse movement for natural motion
export async function humanMouseMove(
  page: Page,
  targetX: number,
  targetY: number
): Promise<void> {
  const viewportSize = page.viewportSize();
  if (!viewportSize) return;

  // Start from a random position or current position
  const startX = Math.random() * viewportSize.width * 0.5;
  const startY = Math.random() * viewportSize.height * 0.5;

  const steps = Math.floor(Math.random() * 20) + 10;
  const points = generateBezierPoints(startX, startY, targetX, targetY, steps);

  logDebug('Mouse move', { from: { x: startX, y: startY }, to: { x: targetX, y: targetY }, steps });

  for (const point of points) {
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(Math.random() * 30 + 10);
  }
}

// Generate points along a cubic bezier curve
function generateBezierPoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  steps: number
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];

  // Control points with some randomness
  const cp1x = startX + (endX - startX) * 0.3 + (Math.random() - 0.5) * 100;
  const cp1y = startY + (endY - startY) * 0.1 + (Math.random() - 0.5) * 100;
  const cp2x = startX + (endX - startX) * 0.7 + (Math.random() - 0.5) * 100;
  const cp2y = startY + (endY - startY) * 0.9 + (Math.random() - 0.5) * 100;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = cubicBezier(t, startX, cp1x, cp2x, endX);
    const y = cubicBezier(t, startY, cp1y, cp2y, endY);
    points.push({ x: Math.round(x), y: Math.round(y) });
  }

  return points;
}

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  return mt3 * p0 + 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t3 * p3;
}

// Hover over an element before clicking
export async function humanHover(page: Page, selector: string): Promise<void> {
  const element = await page.$(selector);
  if (!element) return;

  const box = await element.boundingBox();
  if (!box) return;

  // Move to element with some randomness within the element
  const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
  const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);

  await humanMouseMove(page, targetX, targetY);
  await randomDelay(page, 100, 300);
}

// Human-like click with pre-hover
export async function humanClick(page: Page, selector: string): Promise<void> {
  await humanHover(page, selector);
  await page.click(selector);
  logDebug('Human click', { selector });
}

// Human-like typing with variable speed
export async function humanType(
  page: Page,
  selector: string,
  text: string
): Promise<void> {
  await humanClick(page, selector);
  await randomDelay(page, 100, 300);

  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.random() * 100 + 50 });

    // Occasionally pause longer (thinking)
    if (Math.random() > 0.9) {
      await randomDelay(page, 200, 500);
    }
  }
}

// Apply human behavior based on pattern
export async function applyHumanBehavior(
  page: Page,
  options: HumanBehaviorOptions
): Promise<void> {
  switch (options.pattern) {
    case 'A':
      // Mechanical: fixed delay only
      await page.waitForTimeout(2000);
      break;

    case 'B':
      // Basic: random delay + scroll
      await randomDelay(page, options.minDelay, options.maxDelay);
      await humanScroll(page);
      await randomDelay(page, 500, 1500);
      break;

    case 'C':
      // Advanced: full human simulation
      await randomDelay(page, options.minDelay, options.maxDelay);

      // Random mouse movement
      const viewportSize = page.viewportSize();
      if (viewportSize) {
        const targetX = Math.random() * viewportSize.width * 0.8 + viewportSize.width * 0.1;
        const targetY = Math.random() * viewportSize.height * 0.8 + viewportSize.height * 0.1;
        await humanMouseMove(page, targetX, targetY);
      }

      await humanScroll(page);
      await randomDelay(page, 1000, 3000);

      // Sometimes hover over random elements
      if (Math.random() > 0.5) {
        const links = await page.$$('a');
        if (links.length > 0) {
          const randomLink = links[Math.floor(Math.random() * links.length)];
          const box = await randomLink.boundingBox();
          if (box) {
            await humanMouseMove(page, box.x + box.width / 2, box.y + box.height / 2);
            await randomDelay(page, 200, 500);
          }
        }
      }
      break;
  }
}
