import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Medicine } from '../../src/models/Medicine';
import { IMedexBrandRecord } from './parse-medex';
import { connectDatabase, closeDatabase } from '../../src/config/db';

// Load environment configuration
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PROCESSED_JSON = path.resolve(__dirname, '../../data/medex/processed/medex_brands.json');

interface ImportOptions {
  sample: boolean;
  limit?: number;
  dryRun: boolean;
  batchSize: number;
}

function parseArgs(): ImportOptions {
  const args = process.argv.slice(2);
  const options: ImportOptions = {
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
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--batch=')) {
      options.batchSize = parseInt(arg.split('=')[1], 10) || 500;
    }
  });

  return options;
}

export async function importMedexData(): Promise<void> {
  const options = parseArgs();
  console.log('=====================================================');
  console.log('📥 MedEx Database Importer (DocPresc MongoDB Engine)');
  console.log('=====================================================');
  console.log(`Sample Mode : ${options.sample ? 'YES (First 50 items)' : 'NO'}`);
  console.log(`Dry Run     : ${options.dryRun ? 'YES (No DB Writes)' : 'NO'}`);
  if (options.limit) console.log(`Limit       : ${options.limit} records`);
  console.log(`Batch Size  : ${options.batchSize}`);
  console.log('-----------------------------------------------------');

  if (!fs.existsSync(PROCESSED_JSON)) {
    throw new Error(`Processed data file not found at: ${PROCESSED_JSON}. Please run scraper & cleaner first.`);
  }

  const rawData: IMedexBrandRecord[] = JSON.parse(fs.readFileSync(PROCESSED_JSON, 'utf8'));
  console.log(`Loaded ${rawData.length} records from ${PROCESSED_JSON}`);

  let recordsToImport = rawData;
  if (options.limit && options.limit > 0) {
    recordsToImport = recordsToImport.slice(0, options.limit);
  }

  // Connect to Database
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
      const dosageForm = item.dosageForm?.trim() || 'Tablet';

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
                category: 'General',
                medicineType: 'Allopathic',
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

  console.log('=====================================================');
  console.log('🎉 Database Import Summary:');
  console.log('=====================================================');
  console.log(`Records Read       : ${recordsToImport.length}`);
  console.log(`Valid Records      : ${validCount}`);
  console.log(`Invalid Records    : ${invalidCount}`);
  console.log(`New Insertions     : ${insertedCount}`);
  console.log(`Existing Matched   : ${matchedCount}`);
  console.log(`Records Modified   : ${modifiedCount}`);
  console.log(`Errors             : ${errorCount}`);
  console.log(`Total DB Medicines : ${finalDbCount}`);
  console.log('=====================================================');

  await closeDatabase();
  console.log('✅ MongoDB Disconnected gracefully.');
}

if (require.main === module) {
  importMedexData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal Importer Error:', err);
      process.exit(1);
    });
}
