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
      if (ENV.NODE_ENV === 'production') {
        console.warn('[Database] Retrying connection in 5 seconds...');
        // In production, keep trying external database
        await new Promise((resolve) => setTimeout(resolve, 5000));
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
        console.log('[Database] Connected to external MongoDB on retry.');
        return uri;
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
    try {
      console.log('[Database] Starting in-memory MongoDB server for zero-config operation...');
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
      console.error('[Database] In-memory MongoDB failed:', inMemErr.message);
      throw inMemErr;
    }
  }
};

export const closeDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
  }
};
