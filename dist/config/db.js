"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeDatabase = exports.connectDatabase = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_memory_server_1 = require("mongodb-memory-server");
const env_1 = require("./env");
let mongoMemoryServer = null;
const connectDatabase = async () => {
    let uri = env_1.ENV.MONGODB_URI;
    // 1. Try connecting to provided MONGODB_URI (e.g. MongoDB Atlas)
    if (uri) {
        try {
            await mongoose_1.default.connect(uri, {
                serverSelectionTimeoutMS: 15000,
            });
            console.log('[Database] Successfully connected to external MongoDB.');
            return uri;
        }
        catch (err) {
            console.warn(`[Database] Failed to connect to external MongoDB: ${err.message}`);
            if (env_1.ENV.NODE_ENV === 'production') {
                console.warn('[Database] Retrying connection in 5 seconds...');
                // In production, keep trying external database
                await new Promise((resolve) => setTimeout(resolve, 5000));
                await mongoose_1.default.connect(uri, { serverSelectionTimeoutMS: 15000 });
                console.log('[Database] Connected to external MongoDB on retry.');
                return uri;
            }
        }
    }
    // 2. Try default local mongodb if accessible (development only)
    try {
        await mongoose_1.default.connect('mongodb://localhost:27017/doctor_prescription', {
            serverSelectionTimeoutMS: 2000,
        });
        console.log('[Database] Connected to local MongoDB at mongodb://localhost:27017/doctor_prescription');
        return 'mongodb://localhost:27017/doctor_prescription';
    }
    catch {
        // 3. Fallback to in-memory MongoDB for local zero-config
        try {
            console.log('[Database] Starting in-memory MongoDB server for zero-config operation...');
            mongoMemoryServer = await mongodb_memory_server_1.MongoMemoryServer.create({
                instance: {
                    ip: '127.0.0.1',
                    dbName: 'doctor_prescription',
                },
            });
            uri = mongoMemoryServer.getUri();
            await mongoose_1.default.connect(uri);
            console.log(`[Database] Connected to in-memory MongoDB instance at ${uri}`);
            return uri;
        }
        catch (inMemErr) {
            console.error('[Database] In-memory MongoDB failed:', inMemErr.message);
            throw inMemErr;
        }
    }
};
exports.connectDatabase = connectDatabase;
const closeDatabase = async () => {
    await mongoose_1.default.disconnect();
    if (mongoMemoryServer) {
        await mongoMemoryServer.stop();
    }
};
exports.closeDatabase = closeDatabase;
