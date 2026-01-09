import { MercariScraper, batchScrape, MercariProduct } from './mercari-scraper.js';
import { config, loadConfig, ScraperConfig } from './config.js';
import { logInfo, logError } from './logger.js';
import { isBanned, getBanReason } from './ban-detector.js';

// Export all modules for library usage
export { MercariScraper, batchScrape, MercariProduct } from './mercari-scraper.js';
export { BaseScraper, ScrapeResult } from './scraper.js';
export { config, loadConfig, ScraperConfig, FingerprintConfig, ProxyConfig } from './config.js';
export * from './ban-detector.js';
export * from './human-behavior.js';
export * from './logger.js';

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Playwright BAN Test - Mercari Scraper

Usage:
  npm start <url>                    Scrape a single URL
  npm start <url1> <url2> ...        Scrape multiple URLs
  npm start --test-rate-limit <url>  Run rate limit test

Options:
  --interval <ms>      Set interval between requests (default: 5000)
  --pattern <A|B|C>    Set human behavior pattern (default: B)
  --headless <bool>    Run in headless mode (default: true)
  --no-stealth         Disable stealth plugin

Examples:
  npm start "https://jp.mercari.com/item/m12345678"
  npm start --interval 10000 "https://jp.mercari.com/item/m12345678"
  npm start --test-rate-limit "https://jp.mercari.com/item/m12345678"
`);
    return;
  }

  // Parse arguments
  const urls: string[] = [];
  let interval = 5000;
  let testRateLimit = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--interval' && args[i + 1]) {
      interval = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--pattern' && args[i + 1]) {
      config.humanBehavior.pattern = args[i + 1] as 'A' | 'B' | 'C';
      i++;
    } else if (arg === '--headless' && args[i + 1]) {
      config.headless = args[i + 1] === 'true';
      i++;
    } else if (arg === '--no-stealth') {
      config.stealthEnabled = false;
    } else if (arg === '--test-rate-limit') {
      testRateLimit = true;
    } else if (arg.startsWith('http')) {
      urls.push(arg);
    }
  }

  if (urls.length === 0) {
    console.error('Error: No URLs provided');
    process.exit(1);
  }

  logInfo('Starting scraper', {
    urls: urls.length,
    interval,
    config: {
      headless: config.headless,
      stealth: config.stealthEnabled,
      humanBehavior: config.humanBehavior.pattern,
    },
  });

  if (testRateLimit) {
    await runRateLimitTest(urls[0]);
  } else if (urls.length === 1) {
    await scrapeSingleUrl(urls[0]);
  } else {
    await scrapeMultipleUrls(urls, interval);
  }
}

async function scrapeSingleUrl(url: string): Promise<void> {
  const scraper = new MercariScraper();

  try {
    await scraper.initialize();
    const result = await scraper.scrape(url);

    if (result.success && result.data) {
      console.log('\n=== Scrape Result ===');
      console.log(`Title: ${result.data.title}`);
      console.log(`Price: ¥${result.data.price?.toLocaleString()}`);
      console.log(`Status: ${result.data.statusText}`);
      console.log(`Response Time: ${result.banSignals.responseTimeMs}ms`);
    } else {
      console.log('\n=== Scrape Failed ===');
      console.log(`Error: ${result.error}`);
      if (isBanned(result.banSignals)) {
        console.log(`BAN Reason: ${getBanReason(result.banSignals)}`);
      }
    }
  } catch (error) {
    logError('Scrape failed', error as Error);
  } finally {
    await scraper.close();
  }
}

async function scrapeMultipleUrls(urls: string[], interval: number): Promise<void> {
  const results = await batchScrape(urls, interval);

  console.log('\n=== Batch Scrape Results ===');
  let successCount = 0;
  let failCount = 0;

  for (const [url, result] of results) {
    if (result.success && result.data) {
      successCount++;
      console.log(`\n[OK] ${url}`);
      console.log(`  Title: ${result.data.title}`);
      console.log(`  Price: ¥${result.data.price?.toLocaleString()}`);
      console.log(`  Status: ${result.data.statusText}`);
    } else {
      failCount++;
      console.log(`\n[FAIL] ${url}`);
      console.log(`  Error: ${result.error}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Success: ${successCount}/${urls.length}`);
  console.log(`Failed: ${failCount}/${urls.length}`);
}

async function runRateLimitTest(url: string): Promise<void> {
  console.log('\n=== Rate Limit Test ===');
  console.log('Testing with decreasing intervals to find BAN threshold\n');

  const intervals = [60000, 30000, 15000, 10000, 5000, 3000];
  const requestsPerInterval = 5;

  for (const interval of intervals) {
    console.log(`\nTesting interval: ${interval}ms`);

    const scraper = new MercariScraper();
    let banned = false;

    try {
      await scraper.initialize();

      for (let i = 0; i < requestsPerInterval; i++) {
        const result = await scraper.scrape(url);

        if (isBanned(result.banSignals)) {
          console.log(`  [BAN] Request ${i + 1}: ${getBanReason(result.banSignals)}`);
          banned = true;
          break;
        } else {
          console.log(`  [OK] Request ${i + 1}: ${result.banSignals.responseTimeMs}ms`);
        }

        if (i < requestsPerInterval - 1) {
          await new Promise((resolve) => setTimeout(resolve, interval));
        }
      }

      if (banned) {
        console.log(`\n!!! BAN detected at ${interval}ms interval !!!`);
        console.log(`Recommended safe interval: ${interval * 2}ms or higher`);
        break;
      }
    } catch (error) {
      logError('Rate limit test failed', error as Error);
    } finally {
      await scraper.close();
    }

    // Wait between interval tests
    console.log('  Waiting 30s before next interval test...');
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }

  console.log('\n=== Test Complete ===');
}

// Run main if this is the entry point
main().catch((error) => {
  logError('Fatal error', error);
  process.exit(1);
});
