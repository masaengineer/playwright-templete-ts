# Playwright BAN Test

Playwright-based scraper template with stealth and human behavior simulation for testing anti-bot detection measures.

## Features

- **Stealth Mode**: Uses `playwright-extra` with `puppeteer-extra-plugin-stealth` to bypass bot detection
- **Human Behavior Simulation**: Configurable patterns (A/B/C) for mimicking human interactions
- **BAN Detection**: Automatic detection of CAPTCHA, HTTP errors, and redirect blocks
- **Structured Logging**: JSON-formatted logs for analysis
- **Proxy Support**: Easy proxy configuration for IP rotation

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/playwright-ban-test.git
cd playwright-ban-test

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Copy environment file
cp .env.example .env
```

## Usage

### Single URL Scrape

```bash
npm start "https://jp.mercari.com/item/m12345678"
```

### Multiple URLs

```bash
npm start "https://jp.mercari.com/item/m111" "https://jp.mercari.com/item/m222"
```

### Rate Limit Test

```bash
npm start --test-rate-limit "https://jp.mercari.com/item/m12345678"
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--interval <ms>` | Interval between requests | 5000 |
| `--pattern <A\|B\|C>` | Human behavior pattern | B |
| `--headless <bool>` | Run in headless mode | true |
| `--no-stealth` | Disable stealth plugin | - |

## Human Behavior Patterns

| Pattern | Description |
|---------|-------------|
| A | Mechanical - Fixed 2s delay only |
| B | Basic - Random delays + scrolling |
| C | Advanced - Mouse movements + natural navigation |

## Configuration

Edit `.env` file or set environment variables:

```env
# Proxy Settings
PROXY_SERVER=http://proxy.example.com:8080
PROXY_USER=username
PROXY_PASS=password

# Browser Settings
HEADLESS=true
STEALTH_ENABLED=true

# Human Behavior
HUMAN_BEHAVIOR_ENABLED=true
HUMAN_BEHAVIOR_PATTERN=B
MIN_DELAY=1000
MAX_DELAY=5000

# Logging
LOGGING_ENABLED=true
LOG_LEVEL=info
LOG_OUTPUT_DIR=./logs
```

## Project Structure

```
playwright-ban-test/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── scraper.ts         # Base scraper class
│   ├── mercari-scraper.ts # Mercari-specific scraper
│   ├── human-behavior.ts  # Human simulation functions
│   ├── ban-detector.ts    # BAN detection logic
│   ├── logger.ts          # Structured logging
│   └── config.ts          # Configuration management
├── logs/                  # Log output directory
├── package.json
├── tsconfig.json
└── .env.example
```

## BAN Detection

The scraper automatically detects various blocking signals:

| Signal | Detection Method |
|--------|------------------|
| CAPTCHA | iframes with captcha/recaptcha sources |
| HTTP Error | 403, 429, 503 status codes |
| Redirect | Unexpected redirects to /error, /block pages |
| JS Challenge | "Checking your browser" text patterns |
| Content Missing | Expected selectors not found |

## Library Usage

```typescript
import { MercariScraper, config } from 'playwright-ban-test';

// Configure
config.headless = true;
config.humanBehavior.pattern = 'B';

// Scrape
const scraper = new MercariScraper();
await scraper.initialize();

const result = await scraper.scrape('https://jp.mercari.com/item/m12345678');
if (result.success) {
  console.log(result.data);
}

await scraper.close();
```

## Logs

Logs are written to the `logs/` directory:

- `combined.log` - All logs
- `error.log` - Error logs only
- `requests.jsonl` - Request logs in JSON Lines format

Request log format:

```json
{
  "timestamp": "2024-01-15T10:30:45+09:00",
  "requestId": "req-xxx",
  "config": {
    "ipType": "proxy",
    "headless": true,
    "stealthEnabled": true,
    "humanBehaviorPattern": "B"
  },
  "request": {
    "url": "https://jp.mercari.com/item/m12345678",
    "intervalSinceLastMs": 5000
  },
  "response": {
    "statusCode": 200,
    "loadTimeMs": 2500
  },
  "banSignals": {
    "captchaDetected": false,
    "httpError": null
  }
}
```

## Development

```bash
# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test
```

## Disclaimer

This tool is intended for educational and research purposes. Please:

- Respect the target website's Terms of Service
- Avoid excessive requests that could impact server performance
- Use responsibly and at your own risk

## License

MIT
