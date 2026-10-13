import fs from 'fs';
import path from 'path';
import { IMedexBrandRecord, cleanText } from './parse-medex';

const RAW_DIR = path.resolve(__dirname, '../../data/medex/raw');
const PROCESSED_DIR = path.resolve(__dirname, '../../data/medex/processed');
const REPORTS_DIR = path.resolve(__dirname, '../../data/medex/reports');

const OUTPUT_JSON_FILE = path.join(PROCESSED_DIR, 'medex_brands.json');
const OUTPUT_CSV_FILE = path.join(PROCESSED_DIR, 'medex_brands.csv');
const REPORT_FILE = path.join(REPORTS_DIR, 'scraping_report.json');

// Convert array of objects to CSV string escaping quotes & commas
function convertToCsv(records: IMedexBrandRecord[]): string {
  const headers = ['brandName', 'strength', 'genericName', 'manufacturer', 'dosageForm', 'sourcePage', 'sourceUrl'];
  const rows = records.map((r) => {
    return [
      escapeCsvField(r.brandName),
      escapeCsvField(r.strength),
      escapeCsvField(r.genericName),
      escapeCsvField(r.manufacturer),
      escapeCsvField(r.dosageForm || 'Tablet'),
      r.sourcePage,
      escapeCsvField(r.sourceUrl),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function escapeCsvField(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export function cleanAndDeduplicateRecords(): {
  startPage: number;
  endPage: number;
  successfulPages: number;
  failedPages: number[];
  totalRecords: number;
  uniqueRecords: number;
  duplicatesRemoved: number;
  outputJson: string;
  outputCsv: string;
  generatedAt: string;
} {
  console.log('=====================================================');
  console.log('🧹 MedEx Data Cleaning & Deduplication Pipeline');
  console.log('=====================================================');

  if (!fs.existsSync(RAW_DIR)) {
    throw new Error(`Raw data directory not found: ${RAW_DIR}. Please run scraper first.`);
  }

  const rawFiles = fs.readdirSync(RAW_DIR).filter((f) => f.startsWith('page_') && f.endsWith('.json'));
  console.log(`Found ${rawFiles.length} raw page files in ${RAW_DIR}`);

  const allRecords: IMedexBrandRecord[] = [];
  const pageNumbers: number[] = [];

  rawFiles.forEach((file) => {
    try {
      const match = file.match(/page_(\d+)\.json/);
      if (match) pageNumbers.push(parseInt(match[1], 10));

      const content = fs.readFileSync(path.join(RAW_DIR, file), 'utf8');
      const items: IMedexBrandRecord[] = JSON.parse(content);
      if (Array.isArray(items)) {
        allRecords.push(...items);
      }
    } catch (err: any) {
      console.warn(`[WARN] Skipping invalid raw file ${file}:`, err.message);
    }
  });

  pageNumbers.sort((a, b) => a - b);
  const startPage = pageNumbers[0] || 1;
  const endPage = pageNumbers[pageNumbers.length - 1] || 846;

  console.log(`Loaded ${allRecords.length} raw records across ${pageNumbers.length} pages.`);

  // Deduplication using composite key (brandName + strength + genericName + manufacturer)
  const uniqueMap = new Map<string, IMedexBrandRecord>();
  let duplicateCount = 0;

  allRecords.forEach((item) => {
    const brand = cleanText(item.brandName);
    const strength = cleanText(item.strength);
    const generic = cleanText(item.genericName);
    const manufacturer = cleanText(item.manufacturer);
    const dosageForm = cleanText(item.dosageForm) || 'Tablet';

    if (!brand) return; // Skip invalid records without a brand name

    const compositeKey = [
      brand.toLowerCase(),
      (strength || '').toLowerCase(),
      (generic || '').toLowerCase(),
      (manufacturer || '').toLowerCase(),
      dosageForm.toLowerCase(),
    ].join('___');

    if (uniqueMap.has(compositeKey)) {
      duplicateCount++;
    } else {
      uniqueMap.set(compositeKey, {
        brandName: brand,
        strength: strength || null,
        genericName: generic || null,
        manufacturer: manufacturer || null,
        dosageForm: dosageForm || 'Tablet',
        sourcePage: item.sourcePage,
        sourceUrl: item.sourceUrl,
        detailUrl: item.detailUrl || null,
      });
    }
  });

  const uniqueRecords = Array.from(uniqueMap.values()).sort((a, b) =>
    (a.brandName || '').localeCompare(b.brandName || '')
  );

  // Write medex_brands.json
  fs.writeFileSync(OUTPUT_JSON_FILE, JSON.stringify(uniqueRecords, null, 2), 'utf8');

  // Write medex_brands.csv
  const csvContent = convertToCsv(uniqueRecords);
  fs.writeFileSync(OUTPUT_CSV_FILE, csvContent, 'utf8');

  // Read failed pages if any
  let failedPages: number[] = [];
  const failedFile = path.join(REPORTS_DIR, 'failed_pages.json');
  if (fs.existsSync(failedFile)) {
    try {
      failedPages = JSON.parse(fs.readFileSync(failedFile, 'utf8'));
    } catch {}
  }

  // Generate scraping report
  const report = {
    startPage,
    endPage,
    successfulPages: pageNumbers.length,
    failedPages,
    totalRecords: allRecords.length,
    uniqueRecords: uniqueRecords.length,
    duplicatesRemoved: duplicateCount,
    outputJson: OUTPUT_JSON_FILE,
    outputCsv: OUTPUT_CSV_FILE,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');

  console.log('-----------------------------------------------------');
  console.log(`✅ Cleaned JSON Output : ${OUTPUT_JSON_FILE} (${(fs.statSync(OUTPUT_JSON_FILE).size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`✅ Cleaned CSV Output  : ${OUTPUT_CSV_FILE} (${(fs.statSync(OUTPUT_CSV_FILE).size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`📊 Total Records Read : ${allRecords.length}`);
  console.log(`⭐ Unique Records Saved: ${uniqueRecords.length}`);
  console.log(`✂️ Duplicates Removed : ${duplicateCount}`);
  console.log(`📄 Report Written      : ${REPORT_FILE}`);
  console.log('=====================================================');

  return report;
}

if (require.main === module) {
  try {
    cleanAndDeduplicateRecords();
  } catch (err: any) {
    console.error('Fatal Cleaner Error:', err.message);
    process.exit(1);
  }
}
