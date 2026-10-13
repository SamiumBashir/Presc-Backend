import fs from 'fs';
import path from 'path';
import { IMedexBrandRecord, cleanText, classifyMedicineRecord } from './parse-medex';

const RAW_DIR = path.resolve(__dirname, '../../data/medex/raw_herbal');
const PROCESSED_DIR = path.resolve(__dirname, '../../data/medex/processed');
const REPORTS_DIR = path.resolve(__dirname, '../../data/medex/reports');

// Output file definitions
const UNANI_JSON = path.join(PROCESSED_DIR, 'medex_unani_brands.json');
const UNANI_CSV = path.join(PROCESSED_DIR, 'medex_unani_brands.csv');

const AYURVEDIC_JSON = path.join(PROCESSED_DIR, 'medex_ayurvedic_brands.json');
const AYURVEDIC_CSV = path.join(PROCESSED_DIR, 'medex_ayurvedic_brands.csv');

const HERBAL_SUPP_JSON = path.join(PROCESSED_DIR, 'medex_herbal_supplements.json');
const HERBAL_SUPP_CSV = path.join(PROCESSED_DIR, 'medex_herbal_supplements.csv');

const ALL_HERBAL_JSON = path.join(PROCESSED_DIR, 'medex_all_herbal_brands.json');
const ALL_HERBAL_CSV = path.join(PROCESSED_DIR, 'medex_all_herbal_brands.csv');

const REPORT_FILE = path.join(REPORTS_DIR, 'herbal_scraping_report.json');

// Convert array of records to CSV string escaping quotes & commas
function convertToCsv(records: IMedexBrandRecord[]): string {
  const headers = [
    'brandName',
    'strength',
    'genericName',
    'manufacturer',
    'dosageForm',
    'medicineType',
    'sourcePage',
    'sourceUrl',
  ];

  const rows = records.map((r) => {
    return [
      escapeCsvField(r.brandName),
      escapeCsvField(r.strength),
      escapeCsvField(r.genericName),
      escapeCsvField(r.manufacturer),
      escapeCsvField(r.dosageForm || 'Herbal Preparation'),
      escapeCsvField(r.medicineType || 'Herbal'),
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

export function cleanAndSegregateHerbalRecords(): {
  totalPages: number;
  totalRawRecords: number;
  totalUniqueRecords: number;
  duplicatesRemoved: number;
  unaniCount: number;
  ayurvedicCount: number;
  herbalCount: number;
  outputFiles: Record<string, string>;
  generatedAt: string;
} {
  console.log('=====================================================');
  console.log('🧹 MedEx Herbal, Unani & Ayurvedic Cleaning Pipeline');
  console.log('=====================================================');

  if (!fs.existsSync(RAW_DIR)) {
    throw new Error(`Raw herbal data directory not found at: ${RAW_DIR}. Run scrape-medex-herbal first.`);
  }

  const rawFiles = fs.readdirSync(RAW_DIR).filter((f) => f.startsWith('page_') && f.endsWith('.json'));
  console.log(`Found ${rawFiles.length} raw herbal page files in ${RAW_DIR}`);

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
  console.log(`Loaded ${allRecords.length} raw records across ${pageNumbers.length} pages.`);

  // Deduplication using composite key
  const uniqueMap = new Map<string, IMedexBrandRecord>();
  let duplicateCount = 0;

  allRecords.forEach((item) => {
    const brand = cleanText(item.brandName);
    const strength = cleanText(item.strength);
    const generic = cleanText(item.genericName);
    const manufacturer = cleanText(item.manufacturer);
    const dosageForm = cleanText(item.dosageForm) || 'Herbal Preparation';

    if (!brand) return;

    // Apply high-precision Unani / Ayurvedic / Herbal domain classification
    const medicineType = classifyMedicineRecord({
      brandName: brand,
      genericName: generic,
      manufacturer,
      dosageForm,
    });

    const compositeKey = [
      brand.toLowerCase(),
      (strength || '').toLowerCase(),
      (generic || '').toLowerCase(),
      (manufacturer || '').toLowerCase(),
      dosageForm.toLowerCase(),
      medicineType.toLowerCase(),
    ].join('___');

    if (uniqueMap.has(compositeKey)) {
      duplicateCount++;
    } else {
      uniqueMap.set(compositeKey, {
        brandName: brand,
        strength: strength || null,
        genericName: generic || null,
        manufacturer: manufacturer || null,
        dosageForm,
        medicineType,
        sourcePage: item.sourcePage,
        sourceUrl: `https://medex.com.bd/brands?herbal=1&page=${item.sourcePage}`,
        detailUrl: item.detailUrl || null,
      });
    }
  });

  const allUnique = Array.from(uniqueMap.values()).sort((a, b) =>
    (a.brandName || '').localeCompare(b.brandName || '')
  );

  // Segregate into categories
  const unaniRecords = allUnique.filter((r) => r.medicineType === 'Unani');
  const ayurvedicRecords = allUnique.filter((r) => r.medicineType === 'Ayurvedic');
  const herbalSupplements = allUnique.filter((r) => r.medicineType === 'Herbal');

  // Ensure processed directory exists
  if (!fs.existsSync(PROCESSED_DIR)) {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  }

  // 1. Write Unani files
  fs.writeFileSync(UNANI_JSON, JSON.stringify(unaniRecords, null, 2), 'utf8');
  fs.writeFileSync(UNANI_CSV, convertToCsv(unaniRecords), 'utf8');

  // 2. Write Ayurvedic files
  fs.writeFileSync(AYURVEDIC_JSON, JSON.stringify(ayurvedicRecords, null, 2), 'utf8');
  fs.writeFileSync(AYURVEDIC_CSV, convertToCsv(ayurvedicRecords), 'utf8');

  // 3. Write Herbal / Supplements files
  fs.writeFileSync(HERBAL_SUPP_JSON, JSON.stringify(herbalSupplements, null, 2), 'utf8');
  fs.writeFileSync(HERBAL_SUPP_CSV, convertToCsv(herbalSupplements), 'utf8');

  // 4. Write All Combined Herbal files
  fs.writeFileSync(ALL_HERBAL_JSON, JSON.stringify(allUnique, null, 2), 'utf8');
  fs.writeFileSync(ALL_HERBAL_CSV, convertToCsv(allUnique), 'utf8');

  // Read failed pages if any
  let failedPages: number[] = [];
  const failedFile = path.join(REPORTS_DIR, 'herbal_failed_pages.json');
  if (fs.existsSync(failedFile)) {
    try {
      failedPages = JSON.parse(fs.readFileSync(failedFile, 'utf8'));
    } catch {}
  }

  // Generate summary report
  const report = {
    totalPages: pageNumbers.length,
    startPage: pageNumbers[0] || 1,
    endPage: pageNumbers[pageNumbers.length - 1] || 31,
    failedPages,
    totalRawRecords: allRecords.length,
    totalUniqueRecords: allUnique.length,
    duplicatesRemoved: duplicateCount,
    unaniCount: unaniRecords.length,
    ayurvedicCount: ayurvedicRecords.length,
    herbalCount: herbalSupplements.length,
    outputFiles: {
      unaniJson: UNANI_JSON,
      unaniCsv: UNANI_CSV,
      ayurvedicJson: AYURVEDIC_JSON,
      ayurvedicCsv: AYURVEDIC_CSV,
      herbalSupplementsJson: HERBAL_SUPP_JSON,
      herbalSupplementsCsv: HERBAL_SUPP_CSV,
      allHerbalJson: ALL_HERBAL_JSON,
      allHerbalCsv: ALL_HERBAL_CSV,
    },
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');

  console.log('-----------------------------------------------------');
  console.log(`📊 Total Raw Records       : ${allRecords.length}`);
  console.log(`⭐ Total Unique Records     : ${allUnique.length}`);
  console.log(`✂️ Duplicates Removed      : ${duplicateCount}`);
  console.log('-----------------------------------------------------');
  console.log(`🕌 UNANI Records Saved     : ${unaniRecords.length}`);
  console.log(`   JSON: ${UNANI_JSON}`);
  console.log(`   CSV : ${UNANI_CSV}`);
  console.log('-----------------------------------------------------');
  console.log(`🌿 AYURVEDIC Records Saved : ${ayurvedicRecords.length}`);
  console.log(`   JSON: ${AYURVEDIC_JSON}`);
  console.log(`   CSV : ${AYURVEDIC_CSV}`);
  console.log('-----------------------------------------------------');
  console.log(`🌱 HERBAL (Nutra) Records  : ${herbalSupplements.length}`);
  console.log(`   JSON: ${HERBAL_SUPP_JSON}`);
  console.log(`   CSV : ${HERBAL_SUPP_CSV}`);
  console.log('-----------------------------------------------------');
  console.log(`📦 ALL Herbal Records Combined: ${allUnique.length}`);
  console.log(`   JSON: ${ALL_HERBAL_JSON}`);
  console.log(`   CSV : ${ALL_HERBAL_CSV}`);
  console.log(`📄 Summary Report          : ${REPORT_FILE}`);
  console.log('=====================================================');

  return report;
}

if (require.main === module) {
  try {
    cleanAndSegregateHerbalRecords();
  } catch (err: any) {
    console.error('Fatal Cleaner Error:', err.message);
    process.exit(1);
  }
}
