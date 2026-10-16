import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ENV } from './env';

let mongoMemoryServer: MongoMemoryServer | null = null;

export const connectDatabase = async (): Promise<string> => {
  let uri = ENV.MONGODB_URI;

  // 1. Try connecting to provided MONGODB_URI (e.g. MongoDB Atlas)
  if (uri) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
      });
      console.log('[Database] Successfully connected to external MongoDB.');
      return uri;
    } catch (err: any) {
      console.warn(`[Database] Failed to connect to external MongoDB: ${err.message}`);
      if (err.message?.includes('bad auth')) {
        console.error('[Database] ⚠️ MONGODB_URI authentication failed! Please check your MongoDB Atlas Database Access credentials (username & password) configured in Render environment variables.');
      }
      if (ENV.NODE_ENV === 'production') {
        console.warn('[Database] Retrying connection in 5 seconds...');
        // In production, keep trying external database
        await new Promise((resolve) => setTimeout(resolve, 5000));
        try {
          await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
          console.log('[Database] Connected to external MongoDB on retry.');
          return uri;
        } catch (retryErr: any) {
          console.error(`[Database] Retry failed: ${retryErr.message}`);
          throw retryErr;
        }
      }
    }
  }

  // 2. Try default local mongodb if accessible (development only)
  try {
    await mongoose.connect('mongodb://localhost:27017/doctor_prescription', {
      serverSelectionTimeoutMS: 2000,
    });
    console.log('[Database] Connected to local MongoDB at mongodb://localhost:27017/doctor_prescription');
    return 'mongodb://localhost:27017/doctor_prescription';
  } catch {
    // 3. Fallback to in-memory MongoDB for local zero-config
    let attempts = 0;
    while (attempts < 3) {
      try {
        attempts++;
        console.log(`[Database] Starting in-memory MongoDB server for zero-config operation (attempt ${attempts})...`);
        mongoMemoryServer = await MongoMemoryServer.create({
          instance: {
            ip: '127.0.0.1',
            dbName: 'doctor_prescription',
          },
        });
        uri = mongoMemoryServer.getUri();
        await mongoose.connect(uri);
        console.log(`[Database] Connected to in-memory MongoDB instance at ${uri}`);
        return uri;
      } catch (inMemErr: any) {
        if (attempts >= 3) {
          console.error('[Database] In-memory MongoDB failed:', inMemErr.message);
          throw inMemErr;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error('[Database] Failed to connect to any MongoDB instance.');
  }
};

export const closeDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
  }
};
