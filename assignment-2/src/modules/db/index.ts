import type { Db, MongoClient as MongoClientType } from 'mongodb'
import type { TransactionDoc, UserSettingsDoc, UserDoc } from './models'

// Polyfill แก้ไขปัญหา Bun กับ bson/node:v8
if (typeof globalThis.process?.getBuiltinModule === 'function') {
    const origGetBuiltin = globalThis.process.getBuiltinModule.bind(globalThis.process)
    globalThis.process.getBuiltinModule = (name: string) => {
        if (name === 'v8') return {}
        return origGetBuiltin(name)
    }
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://parnuan_submission:parnuan_submission_password@127.0.0.1:27017/parnuan?authSource=admin'
const DB_NAME = process.env.MONGODB_DB_NAME || 'parnuan'

let client: MongoClientType | null = null
let db: Db | null = null
let connectionPromise: Promise<Db> | null = null

/**
 * ฟังก์ชันเชื่อมต่อ MongoDB แบบ Singleton พร้อมป้องกัน Race Condition
 */
export async function connectDb(): Promise<Db> {
    if (db) return db
    if (connectionPromise) return connectionPromise

    connectionPromise = (async () => {
        try {
            // โหลด MongoClient ผ่าน dynamic import หลังจาก Shim ทำงานแล้ว
            const { MongoClient } = await import('mongodb')

            client = new MongoClient(MONGODB_URI, {
                maxPoolSize: 10,
                minPoolSize: 2,
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 10000,
            })

            await client.connect()
            db = client.db(DB_NAME)
            console.log(`[MongoDB] Connected successfully to database: "${DB_NAME}"`)

            // สร้าง Indexes อัตโนมัติใน Background
            await initIndexes(db)

            return db
        } catch (error) {
            console.error('[MongoDB] Connection failed:', error)
            client = null
            db = null
            connectionPromise = null
            throw error
        }
    })()

    return connectionPromise
}

/**
 * ดึง Database Instance (โยน Error ชัดเจนถ้ายังไม่ได้เชื่อมต่อ)
 */
export function getDb(): Db {
    if (!db) {
        throw new Error('[MongoDB] Database is not connected. Call connectDb() first.')
    }
    return db
}

/**
 * ดึง Typed Collections สำหรับใช้งานใน Service
 */
export function getCollections() {
    const database = getDb()
    return {
        transactions: database.collection<TransactionDoc>('transactions'),
        userSettings: database.collection<UserSettingsDoc>('user_settings'),
        users: database.collection<UserDoc>('users'),
    }
}

/**
 * สร้าง Index สำคัญเพื่อเร่งความเร็วในการคำนวณ Memory (Derived Memory View)
 */
async function initIndexes(database: Db): Promise<void> {
    try {
        const transactions = database.collection<TransactionDoc>('transactions')
        const userSettings = database.collection<UserSettingsDoc>('user_settings')
        const users = database.collection<UserDoc>('users')

        await Promise.all([
            // Index สำหรับ Query Memory ด้วย userId + normalizedKey + eligibility
            transactions.createIndex({ userId: 1, normalizedKey: 1, memoryEligible: 1, memoryExcluded: 1 }),
            // Index สำหรับ Query Memory ด้วยเวลา
            transactions.createIndex({ userId: 1, updatedAt: -1 }),
            // Unique Index สำหรับการตั้งค่าผู้ใช้
            userSettings.createIndex({ userId: 1 }, { unique: true }),
            // Unique Index สำหรับ User ID
            users.createIndex({ id: 1 }, { unique: true }),
        ])
        console.log('[MongoDB] Indexes initialized successfully.')
    } catch (error) {
        console.warn('[MongoDB] Index initialization warning:', error)
    }
}

/**
 * Health Check: ตรวจสอบว่าฐานข้อมูลยังตอบสนองอยู่หรือไม่
 */
export async function pingDb(): Promise<boolean> {
    try {
        if (!db) return false
        await db.command({ ping: 1 })
        return true
    } catch {
        return false
    }
}

/**
 * ปิด Connection อย่างปลอดภัย (Graceful Shutdown)
 */
export async function closeDb(): Promise<void> {
    if (client) {
        await client.close()
        client = null
        db = null
        connectionPromise = null
        console.log('[MongoDB] Connection pool closed.')
    }
}

// ดักจับสัญญาณปิดโปรแกรม (SIGINT / SIGTERM) เพื่อ Graceful Shutdown
if (typeof process !== 'undefined') {
    const handleShutdown = async () => {
        await closeDb()
        process.exit(0)
    }
    process.once('SIGINT', handleShutdown)
    process.once('SIGTERM', handleShutdown)
}