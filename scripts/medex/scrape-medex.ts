import fs from 'fs';
import path from 'path';
import { parseMedexHtml, IMedexBrandRecord } from './parse-medex';

interface ScraperOptions {
  startPage: number;
  endPage: number;
  concurrency: number;
  delayMs: number;
  force: boolean;
  sampleOnly: boolean;
}

const RAW_DIR = path.resolve(__dirname, '../../data/medex/raw');
const PROCESSED_DIR = path.resolve(__dirname, '../../data/medex/processed');
const REPORTS_DIR = path.resolve(__dirname, '../../data/medex/reports');
const CHECKPOINT_FILE = path.join(RAW_DIR, 'checkpoint.json');
const FAILED_PAGES_FILE = path.join(REPORTS_DIR, 'failed_pages.json');

// Ensure data directories exist
[RAW_DIR, PROCESSED_DIR, REPORTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Parse CLI arguments
function parseArgs(): ScraperOptions {
  const args = process.argv.slice(2);
  const options: ScraperOptions = {
    startPage: 1,
    endPage: 846,
    concurrency: 5,
    delayMs: 250,
    force: false,
    sampleOnly: false,
  };

  args.forEach((arg) => {
    if (arg === '--sample') {
      options.sampleOnly = true;
      options.startPage = 1;
      options.endPage = 3;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg.startsWith('--start=')) {
      options.startPage = parseInt(arg.split('=')[1], 10) || 1;
    } else if (arg.startsWith('--end=')) {
      options.endPage = parseInt(arg.split('=')[1], 10) || 846;
    } else if (arg.startsWith('--concurrency=')) {
      options.concurrency = parseInt(arg.split('=')[1], 10) || 5;
    } else if (arg.startsWith('--delay=')) {
      options.delayMs = parseInt(arg.split('=')[1], 10) || 250;
    }
  });

  return options;
}

// Fetch single page with retries and realistic headers
async function fetchPageHtml(pageNum: number, maxRetries = 3): Promise<string> {
  const url = `https://medex.com.bd/brands?page=${pageNum}`;
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
    'Cache-Control': 'no-cache',
    Referer: 'https://medex.com.bd/brands',
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { headers });
      if (response.status === 429) {
        const backoff = attempt * 2500;
        console.warn(`[WARN] Page ${pageNum} rate limited (429). Backing off for ${backoff}ms...`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      return html;
    } catch (err: any) {
      if (attempt === maxRetries) {
        throw new Error(`Failed to fetch page ${pageNum} after ${maxRetries} attempts: ${err.message}`);
      }
      const backoff = attempt * 1200;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw new Error(`Exhausted retries for page ${pageNum}`);
}

// Save per-page json cache
function savePageData(pageNum: number, records: IMedexBrandRecord[]): void {
  const filePath = path.join(RAW_DIR, `page_${pageNum}.json`);
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8');
}

// Read per-page json cache
function loadPageData(pageNum: number): IMedexBrandRecord[] | null {
  const filePath = path.join(RAW_DIR, `page_${pageNum}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Load Checkpoint
function loadCheckpoint(): { completedPages: number[]; lastUpdated: string } {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    } catch {}
  }
  return { completedPages: [], lastUpdated: new Date().toISOString() };
}

// Save Checkpoint
function saveCheckpoint(completedPages: number[]): void {
  fs.writeFileSync(
    CHECKPOINT_FILE,
    JSON.stringify(
      {
        completedPages: Array.from(new Set(completedPages)).sort((a, b) => a - b),
        lastUpdated: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );
}

export async function runScraper(): Promise<{
  totalPages: number;
  successfulPages: number;
  failedPages: number[];
  totalRawRecords: number;
}> {
  const options = parseArgs();
  console.log('=====================================================');
  console.log('🚀 MedEx Medicine Data Scraper (DocPresc Engine)');
  console.log('=====================================================');
  console.log(`Page Range   : ${options.startPage} -> ${options.endPage}`);
  console.log(`Concurrency  : ${options.concurrency} workers`);
  console.log(`Delay        : ${options.delayMs}ms`);
  console.log(`Force Refresh: ${options.force ? 'YES' : 'NO'}`);
  console.log(`Sample Mode  : ${options.sampleOnly ? 'YES (pages 1-3 & sample pages)' : 'NO (Full run)'}`);
  console.log('-----------------------------------------------------');

  let pagesToScrape: number[] = [];
  if (options.sampleOnly) {
    pagesToScrape = [1, 2, 3, 10, 100, 500, 846];
  } else {
    for (let p = options.startPage; p <= options.endPage; p++) {
      pagesToScrape.push(p);
    }
  }

  const checkpoint = loadCheckpoint();
  const completedSet = new Set(options.force ? [] : checkpoint.completedPages);
  const queue = pagesToScrape.filter((p) => options.force || !completedSet.has(p) || !loadPageData(p));

  console.log(`Total Pages Target : ${pagesToScrape.length}`);
  console.log(`Already Cached     : ${pagesToScrape.length - queue.length}`);
  console.log(`Pending To Scrape  : ${queue.length}`);
  console.log('-----------------------------------------------------');

  const failedPages: number[] = [];
  let totalRawRecords = 0;
  let processedCount = pagesToScrape.length - queue.length;

  // Worker queue processor
  let queueIndex = 0;
  const workers = Array.from({ length: Math.min(options.concurrency, queue.length || 1) }, async (_, workerId) => {
    while (queueIndex < queue.length) {
      const pageNum = queue[queueIndex++];
      if (pageNum === undefined) break;

      try {
        // Fetch & Parse
        const html = await fetchPageHtml(pageNum);
        const records = parseMedexHtml(html, pageNum);

        savePageData(pageNum, records);
        completedSet.add(pageNum);
        processedCount++;

        console.log(
          `[W${workerId + 1}] [${processedCount}/${pagesToScrape.length}] Page ${pageNum.toString().padStart(3, ' ')}: Extracted ${records.length.toString().padStart(2, ' ')} brands | Sample: ${records[0]?.brandName || 'N/A'}`
        );

        if (processedCount % 10 === 0) {
          saveCheckpoint(Array.from(completedSet));
        }

        if (options.delayMs > 0) {
          await new Promise((r) => setTimeout(r, options.delayMs + Math.floor(Math.random() * 80)));
        }
      } catch (err: any) {
        console.error(`❌ [ERROR] Failed to scrape page ${pageNum}:`, err.message);
        failedPages.push(pageNum);
      }
    }
  });

  await Promise.all(workers);

  // Save final checkpoint & failed pages
  saveCheckpoint(Array.from(completedSet));
  fs.writeFileSync(FAILED_PAGES_FILE, JSON.stringify(failedPages, null, 2), 'utf8');

  // Count total raw records across all completed pages
  pagesToScrape.forEach((p) => {
    const data = loadPageData(p);
    if (data) totalRawRecords += data.length;
  });

  console.log('=====================================================');
  console.log('✅ Scraping Step Completed');
  console.log(`Successful Pages : ${completedSet.size}`);
  console.log(`Failed Pages     : ${failedPages.length}`);
  console.log(`Total Raw Brands : ${totalRawRecords}`);
  console.log('=====================================================');

  return {
    totalPages: pagesToScrape.length,
    successfulPages: completedSet.size,
    failedPages,
    totalRawRecords,
  };
}

if (require.main === module) {
  runScraper()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal Scraper Error:', err);
      process.exit(1);
    });
}
