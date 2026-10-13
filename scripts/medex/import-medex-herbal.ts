import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Medicine } from '../../src/models/Medicine';
import { IMedexBrandRecord } from './parse-medex';
import { connectDatabase, closeDatabase } from '../../src/config/db';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PROCESSED_DIR = path.resolve(__dirname, '../../data/medex/processed');

interface HerbalImportOptions {
  type: 'unani' | 'ayurvedic' | 'herbal' | 'all';
  customFile?: string;
  sample: boolean;
  limit?: number;
  dryRun: boolean;
  batchSize: number;
}

function parseArgs(): HerbalImportOptions {
  const args = process.argv.slice(2);
  const options: HerbalImportOptions = {
    type: 'all',
    sample: false,
    dryRun: false,
    batchSize: 500,
  };

  args.forEach((arg) => {
    if (arg === '--sample') {
      options.sample = true;
      options.limit = 50;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--type=')) {
      const val = arg.split('=')[1].toLowerCase() as any;
      if (['unani', 'ayurvedic', 'herbal', 'all'].includes(val)) {
        options.type = val;
      }
    } else if (arg.startsWith('--file=')) {
      options.customFile = arg.split('=')[1];
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--batch=')) {
      options.batchSize = parseInt(arg.split('=')[1], 10) || 500;
    }
  });

  return options;
}

function resolveFilePath(options: HerbalImportOptions): string {
  if (options.customFile) return path.resolve(process.cwd(), options.customFile);
  switch (options.type) {
    case 'unani':
      return path.join(PROCESSED_DIR, 'medex_unani_brands.json');
    case 'ayurvedic':
      return path.join(PROCESSED_DIR, 'medex_ayurvedic_brands.json');
    case 'herbal':
      return path.join(PROCESSED_DIR, 'medex_herbal_supplements.json');
    case 'all':
    default:
      return path.join(PROCESSED_DIR, 'medex_all_herbal_brands.json');
  }
}

export async function importHerbalData(): Promise<void> {
  const options = parseArgs();
  const filePath = resolveFilePath(options);

  console.log('=====================================================');
  console.log('📥 MedEx Herbal/Traditional DB Importer (DocPresc)');
  console.log('=====================================================');
  console.log(`Target Type : ${options.type.toUpperCase()}`);
  console.log(`Source File : ${filePath}`);
  console.log(`Sample Mode : ${options.sample ? 'YES (First 50 items)' : 'NO'}`);
  console.log(`Dry Run     : ${options.dryRun ? 'YES (No DB Writes)' : 'NO'}`);
  if (options.limit) console.log(`Limit       : ${options.limit} records`);
  console.log(`Batch Size  : ${options.batchSize}`);
  console.log('-----------------------------------------------------');

  if (!fs.existsSync(filePath)) {
    throw new Error(`Data file not found at: ${filePath}. Please run clean-medex-herbal first.`);
  }

  const rawData: IMedexBrandRecord[] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`Loaded ${rawData.length} records from ${filePath}`);

  let recordsToImport = rawData;
  if (options.limit && options.limit > 0) {
    recordsToImport = recordsToImport.slice(0, options.limit);
  }

  await connectDatabase();

  let validCount = 0;
  let invalidCount = 0;
  let insertedCount = 0;
  let matchedCount = 0;
  let modifiedCount = 0;
  let errorCount = 0;

  console.log(`Processing ${recordsToImport.length} records in batches of ${options.batchSize}...`);

  for (let i = 0; i < recordsToImport.length; i += options.batchSize) {
    const chunk = recordsToImport.slice(i, i + options.batchSize);
    const bulkOps: any[] = [];

    chunk.forEach((item) => {
      const brandName = item.brandName?.trim();
      const genericName = item.genericName?.trim() || 'General';
      const strength = item.strength?.trim() || 'N/A';
      const manufacturer = item.manufacturer?.trim() || 'General';
      const dosageForm = item.dosageForm?.trim() || 'Herbal Preparation';
      const medicineType = item.medicineType || 'Herbal';

      if (!brandName) {
        invalidCount++;
        return;
      }

      validCount++;

      if (!options.dryRun) {
        bulkOps.push({
          updateOne: {
            filter: {
              brandName,
              strength,
              genericName,
              manufacturer,
            },
            update: {
              $set: {
                brandName,
                genericName,
                strength,
                dosageForm,
                manufacturer,
                category: medicineType,
                medicineType,
                status: 'active',
              },
              $setOnInsert: {
                createdAt: new Date(),
              },
            },
            upsert: true,
          },
        });
      }
    });

    if (!options.dryRun && bulkOps.length > 0) {
      try {
        const result = await Medicine.bulkWrite(bulkOps, { ordered: false });
        insertedCount += result.upsertedCount;
        matchedCount += result.matchedCount;
        modifiedCount += result.modifiedCount;

        const progressPercent = Math.min(100, Math.round(((i + chunk.length) / recordsToImport.length) * 100));
        console.log(
          `[Batch ${Math.floor(i / options.batchSize) + 1}] Processed: ${Math.min(i + chunk.length, recordsToImport.length)}/${recordsToImport.length} (${progressPercent}%) | Upserted: ${result.upsertedCount}, Matched: ${result.matchedCount}`
        );
      } catch (err: any) {
        console.error(`❌ Batch error:`, err.message);
        errorCount++;
      }
    }
  }

  const finalDbCount = await Medicine.countDocuments();
  const unaniDbCount = await Medicine.countDocuments({ medicineType: 'Unani' });
  const ayurvedicDbCount = await Medicine.countDocuments({ medicineType: 'Ayurvedic' });
  const herbalDbCount = await Medicine.countDocuments({ medicineType: 'Herbal' });

  console.log('=====================================================');
  console.log('🎉 Database Import Summary:');
  console.log('=====================================================');
  console.log(`Records Read          : ${recordsToImport.length}`);
  console.log(`Valid Records         : ${validCount}`);
  console.log(`Invalid Records       : ${invalidCount}`);
  console.log(`New Insertions        : ${insertedCount}`);
  console.log(`Existing Matched      : ${matchedCount}`);
  console.log(`Records Modified      : ${modifiedCount}`);
  console.log(`Errors                : ${errorCount}`);
  console.log('-----------------------------------------------------');
  console.log(`Total DB Medicines    : ${finalDbCount}`);
  console.log(`- Unani Medicines     : ${unaniDbCount}`);
  console.log(`- Ayurvedic Medicines : ${ayurvedicDbCount}`);
  console.log(`- Herbal Medicines    : ${herbalDbCount}`);
  console.log('=====================================================');

  await closeDatabase();
  console.log('✅ MongoDB Disconnected gracefully.');
}

if (require.main === module) {
  importHerbalData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal Herbal Importer Error:', err);
      process.exit(1);
    });
}
