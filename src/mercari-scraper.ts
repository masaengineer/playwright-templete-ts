import { BaseScraper, ScrapeResult } from './scraper.js';
import { checkContentPresence, BanSignals } from './ban-detector.js';
import { logInfo, logDebug } from './logger.js';

export interface MercariProduct {
  url: string;
  title: string | null;
  price: number | null;
  isSoldOut: boolean;
  statusText: string;
  seller?: string;
  description?: string;
  imageUrls?: string[];
}

// Selectors for Mercari product page
const MERCARI_SELECTORS = {
  title: [
    '[data-testid="item-name"]',
    'h1[class*="ItemName"]',
    '.item-name',
    'h1',
  ],
  price: [
    '[data-testid="price"]',
    '[class*="ItemPrice"]',
    '.item-price',
    '[data-testid="item-price"]',
  ],
  soldOutButton: [
    'button[data-testid="disabled-purchase-button"]',
    'button[disabled][data-testid="purchase-button"]',
  ],
  purchaseButton: [
    'button[data-testid="purchase-button"]',
    'button[data-testid="buy-button"]',
    '.purchase-button',
    '.buy-button',
  ],
  soldOutBadge: [
    '.mer-item-thumbnail__soldout-badge',
    '.soldout-badge',
    '.sold-badge',
    '[data-testid="soldout-badge"]',
  ],
  soldOutText: [
    '売り切れました',
    '売り切れ',
    'SOLD',
    'sold out',
  ],
  seller: [
    '[data-testid="seller-name"]',
    '.seller-name',
  ],
  description: [
    '[data-testid="item-description"]',
    '.item-description',
  ],
};

export class MercariScraper extends BaseScraper {
  async scrape(url: string): Promise<ScrapeResult<MercariProduct>> {
    logInfo('Starting Mercari scrape', { url });

    const navResult = await this.navigate(url);
    if (!navResult.success) {
      return {
        success: false,
        banSignals: navResult.banSignals,
        error: navResult.error,
      };
    }

    try {
      const product = await this.extractProductInfo(url);

      // Check if content was actually extracted
      const contentPresent = await checkContentPresence(
        this.page!,
        MERCARI_SELECTORS.title
      );

      const banSignals: BanSignals = {
        ...navResult.banSignals,
        contentMissing: !contentPresent,
      };

      if (!contentPresent) {
        return {
          success: false,
          data: product,
          banSignals,
          error: 'Content extraction failed - page may be blocked',
        };
      }

      return {
        success: true,
        data: product,
        banSignals,
      };
    } catch (error) {
      return {
        success: false,
        banSignals: navResult.banSignals,
        error: (error as Error).message,
      };
    }
  }

  private async extractProductInfo(url: string): Promise<MercariProduct> {
    const title = await this.extractTitleFromSelectors();
    const price = await this.extractPriceFromSelectors();
    const isSoldOut = await this.checkSoldOutStatus();
    const seller = await this.extractFromSelectors(MERCARI_SELECTORS.seller);
    const description = await this.extractFromSelectors(MERCARI_SELECTORS.description);

    const product: MercariProduct = {
      url,
      title,
      price,
      isSoldOut,
      statusText: isSoldOut ? '売り切れ' : '販売中',
      seller: seller || undefined,
      description: description || undefined,
    };

    logDebug('Extracted product info', { title, price, isSoldOut });
    return product;
  }

  private async extractTitleFromSelectors(): Promise<string | null> {
    for (const selector of MERCARI_SELECTORS.title) {
      const text = await this.extractText(selector);
      if (text && text.trim().length > 0) {
        return text.trim();
      }
    }
    return null;
  }

  private async extractPriceFromSelectors(): Promise<number | null> {
    for (const selector of MERCARI_SELECTORS.price) {
      const text = await this.extractText(selector);
      if (text) {
        // Extract numbers from price text (e.g., "¥1,234" -> 1234)
        const priceMatch = text.replace(/[^\d]/g, '');
        if (priceMatch) {
          return parseInt(priceMatch, 10);
        }
      }
    }
    return null;
  }

  private async checkSoldOutStatus(): Promise<boolean> {
    if (!this.page) return false;

    // Priority 1: Check for disabled purchase button
    for (const selector of MERCARI_SELECTORS.soldOutButton) {
      const element = await this.page.$(selector);
      if (element) {
        logDebug('Sold out detected via disabled button', { selector });
        return true;
      }
    }

    // Priority 2: Check if purchase button is disabled
    for (const selector of MERCARI_SELECTORS.purchaseButton) {
      const element = await this.page.$(selector);
      if (element) {
        const isDisabled = await element.evaluate((el) => {
          return (el as HTMLButtonElement).disabled;
        });
        if (isDisabled) {
          logDebug('Sold out detected via button disabled state', { selector });
          return true;
        }
      }
    }

    // Priority 3: Check for sold out badge
    for (const selector of MERCARI_SELECTORS.soldOutBadge) {
      const element = await this.page.$(selector);
      if (element) {
        logDebug('Sold out detected via badge', { selector });
        return true;
      }
    }

    // Priority 4: Check for sold out text in page
    const pageContent = await this.page.content();
    for (const text of MERCARI_SELECTORS.soldOutText) {
      if (pageContent.includes(text)) {
        logDebug('Sold out detected via text', { text });
        return true;
      }
    }

    return false;
  }

  private async extractFromSelectors(selectors: string[]): Promise<string | null> {
    for (const selector of selectors) {
      const text = await this.extractText(selector);
      if (text && text.trim().length > 0) {
        return text.trim();
      }
    }
    return null;
  }
}

// Utility function for batch scraping with rate limiting
export async function batchScrape(
  urls: string[],
  intervalMs: number = 5000
): Promise<Map<string, ScrapeResult<MercariProduct>>> {
  const scraper = new MercariScraper();
  await scraper.initialize();

  const results = new Map<string, ScrapeResult<MercariProduct>>();

  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      logInfo(`Processing URL ${i + 1}/${urls.length}`, { url });

      const result = await scraper.scrape(url);
      results.set(url, result);

      // Check if we got banned
      if (!result.success && result.banSignals.captchaDetected) {
        logInfo('BAN detected, stopping batch scrape');
        break;
      }

      // Wait before next request (except for last one)
      if (i < urls.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  } finally {
    await scraper.close();
  }

  return results;
}
