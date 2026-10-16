import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ENV } from './env';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

let cached: MongooseCache = global.mongooseCache || { conn: null, promise: null };
if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

let mongoMemoryServer: MongoMemoryServer | null = null;

export const isDatabaseConnected = (): boolean => {
  return mongoose.connection.readyState === 1;
};

/**
 * Connects to MongoDB with connection caching for serverless environments.
 * - Reuses existing open connection across warm invocations.
 * - Caps maxPoolSize to prevent exhausting MongoDB Atlas limits.
 * - Uses a bounded serverSelectionTimeoutMS so errors fail fast before serverless timeouts.
 */
export const connectDatabase = async (): Promise<string> => {
  const uri = ENV.MONGODB_URI || process.env.MONGODB_URI;

  // 1. If connection is already open, reuse immediately
  if (mongoose.connection.readyState === 1) {
    cached.conn = mongoose;
    return uri || 'mongodb://connected';
  }

  // 2. If a connection is in-flight, await the existing promise
  if (cached.conn) {
    return uri || 'mongodb://connected';
  }

  // 3. Connect to external MongoDB (Atlas) if URI is provided
  if (uri) {
    if (!cached.promise) {
      const opts: mongoose.ConnectOptions = {
        bufferCommands: false,
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: 10,
        socketTimeoutMS: 20000,
      };

      cached.promise = mongoose
        .connect(uri, opts)
        .then((mongooseInstance) => {
          console.log('[Database] Successfully connected to external MongoDB Atlas.');
          return mongooseInstance;
        })
        .catch((err: any) => {
          cached.promise = null; // Reset so next request can retry
          console.warn(`[Database] Failed to connect to external MongoDB: ${err.message}`);
          if (err.message?.includes('bad auth')) {
            console.error(
              '[Database] ⚠️ MONGODB_URI authentication failed! Please check MongoDB Atlas Database Access credentials (username & password).'
            );
          }
          throw err;
        });
    }

    try {
      cached.conn = await cached.promise;
      return uri;
    } catch (err: any) {
      cached.promise = null;

      // In production (or Vercel serverless), do not attempt in-memory server
      const isProduction =
        ENV.NODE_ENV === 'production' ||
        process.env.NODE_ENV === 'production' ||
        Boolean(process.env.VERCEL);

      if (isProduction) {
        throw new Error(`[Database] Production MongoDB connection failed: ${err.message}`);
      }
    }
  }

  // 4. In development/testing: Try default local MongoDB
  try {
    await mongoose.connect('mongodb://localhost:27017/doctor_prescription', {
      serverSelectionTimeoutMS: 2000,
    });
    console.log('[Database] Connected to local MongoDB at mongodb://localhost:27017/doctor_prescription');
    cached.conn = mongoose;
    return 'mongodb://localhost:27017/doctor_prescription';
  } catch {
    // 5. Fallback to in-memory MongoDB for local zero-config testing
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
        const memUri = mongoMemoryServer.getUri();
        await mongoose.connect(memUri);
        console.log(`[Database] Connected to in-memory MongoDB instance at ${memUri}`);
        cached.conn = mongoose;
        return memUri;
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
  cached.conn = null;
  cached.promise = null;
  await mongoose.disconnect();
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
    mongoMemoryServer = null;
  }
};
