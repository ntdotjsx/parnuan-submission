import { getCollections } from '../db'
import type { TransactionDoc, UserDoc } from '../db/models'
import { createId } from '../utils'

export const DEFAULT_USER_ID = 'user_nut'

export interface MemoryMatchResult {
    categoryId: string
    categoryTitle: string
    confidence: number
    frequency: number
    lastUsedAt: Date
    source: 'memory'
}

export interface MemoryInsightItem {
    keyword: string
    preferredCategoryId: string
    preferredCategoryTitle: string
    frequency: number
    lastUsedAt: Date
    confidence: number
}

export interface LearnItemInput {
    id?: string
    description: string
    amount: number
    categoryId: string
    categoryTitle: string
    date?: string
}

/**
 * ฟังก์ชัน Normalize ข้อความสำหรับใช้เป็น Key ของ Memory
 * - ตัดเว้นวรรคหัวท้าย
 * - แปลงเป็นตัวพิมพ์เล็ก (กรณีภาษาอังกฤษ)
 * - ยุบเว้นวรรคที่ซ้ำซ้อน
 */
export function normalizeMemoryKey(text: string): string {
    if (!text || typeof text !== 'string') return ''
    return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * ดึงรายชื่อผู้ใช้ทั้งหมดในระบบ
 */
export async function getAllUsers(): Promise<UserDoc[]> {
    const { users } = getCollections()
    return users.find().toArray()
}

/**
 * ตรวจสอบและ Resolve User:
 * - ถ้าส่ง userId มา: ตรวจว่ามีอยู่ใน DB หรือไม่ (ถ้าไม่เจอ คืนค่า null)
 * - ถ้าไม่ส่งมา: คืนค่า User หลัก (DEFAULT_USER_ID)
 */
export async function resolveUser(userIdInput?: string): Promise<UserDoc | null> {
    const { users } = getCollections()
    const targetId = userIdInput?.trim() || DEFAULT_USER_ID
    return users.findOne({ id: targetId })
}

/**
 * ตรวจสอบว่าผู้ใช้เปิดใช้งาน Memory หรือไม่ (ค่าเริ่มต้นคือ true)
 */
export async function isMemoryEnabled(userId: string): Promise<boolean> {
    const { userSettings } = getCollections()
    const setting = await userSettings.findOne({ userId })
    return setting ? setting.memoryEnabled : true
}

/**
 * สลับการตั้งค่า เปิด/ปิด Memory
 */
export async function setMemoryEnabled(userId: string, enabled: boolean): Promise<boolean> {
    const { userSettings } = getCollections()
    await userSettings.updateOne(
        { userId },
        {
            $set: {
                userId,
                memoryEnabled: enabled,
                updatedAt: new Date(),
            },
        },
        { upsert: true },
    )
    return enabled
}

/**
 * ฟังก์ชันเรียนรู้รายการที่ยืนยันแล้ว (Passive Learning - Demo Flow 1)
 * - รับรายการที่ User กดยืนยัน
 * - แปลงเป็น Transaction Document
 * - บันทึกลง Collection transactions ใน MongoDB
 */
export async function learnTransactions(
    userId: string,
    items: LearnItemInput[],
): Promise<void> {
    if (!items || items.length === 0) return

    const { transactions } = getCollections()
    const now = new Date()

    const docs: TransactionDoc[] = items.map((item) => ({
        id: item.id || createId(),
        userId,
        description: item.description.trim(),
        normalizedKey: normalizeMemoryKey(item.description),
        amount: item.amount,
        categoryId: item.categoryId,
        categoryTitle: item.categoryTitle,
        date: item.date || now.toISOString(),
        createdAt: now,
        updatedAt: now,
    }))

    await transactions.insertMany(docs)
}

/**
 * ฟังก์ชันค้นหาหมวดหมู่จาก Memory ผ่าน MongoDB Aggregation
 * @param userId - รหัสผู้ใช้
 * @param description - ข้อความที่ผู้ใช้พิมพ์เข้ามา
 * @returns ผลลัพธ์หมวดหมู่ที่จำได้ หรือ null ถ้าไม่พบประวัติ หรือ ปิดความจำ
 */
export async function getMemoryMatch(
    userId: string,
    description: string,
): Promise<MemoryMatchResult | null> {
    const enabled = await isMemoryEnabled(userId)
    if (!enabled) return null

    const normalizedKey = normalizeMemoryKey(description)
    if (!normalizedKey) return null

    const { transactions } = getCollections()

    const pipeline = [
        {
            $match: {
                userId,
                normalizedKey,
            },
        },
        {
            $group: {
                _id: '$categoryId',
                categoryTitle: { $first: '$categoryTitle' },
                frequency: { $sum: 1 },
                lastUsedAt: { $max: '$updatedAt' },
            },
        },
        {
            $sort: {
                frequency: -1 as const,
                lastUsedAt: -1 as const,
            },
        },
        { $limit: 1 },
    ]

    const results = await transactions.aggregate(pipeline).toArray()
    if (results.length === 0) return null

    const bestMatch = results[0]

    // คำนวณคะแนนความมั่นใจ (Confidence Score)
    // 1 ครั้ง = 0.85, ตั้งแต่ 2 ครั้งขึ้นไป = 0.95
    const confidence = bestMatch.frequency >= 2 ? 0.95 : 0.85

    return {
        categoryId: bestMatch._id,
        categoryTitle: bestMatch.categoryTitle || bestMatch._id,
        confidence,
        frequency: bestMatch.frequency,
        lastUsedAt: bestMatch.lastUsedAt,
        source: 'memory',
    }
}

/**
 * แก้ไขหมวดหมู่ของรายการในอดีต (Edit History -> Sync Memory - Demo Flow 2)
 */
export async function updateTransactionCategory(
    userId: string,
    transactionId: string,
    newCategoryId: string,
    newCategoryTitle: string,
): Promise<boolean> {
    const { transactions } = getCollections()
    const result = await transactions.updateOne(
        { userId, id: transactionId },
        {
            $set: {
                categoryId: newCategoryId,
                categoryTitle: newCategoryTitle,
                updatedAt: new Date(),
            },
        },
    )
    return result.modifiedCount > 0
}

/**
 * ดึงข้อมูลความจำทั้งหมดของผู้ใช้มาตรวจสอบ (Inspectable Memory)
 */
export async function inspectUserMemory(userId: string): Promise<MemoryInsightItem[]> {
    const { transactions } = getCollections()

    const pipeline = [
        { $match: { userId } },
        {
            $group: {
                _id: {
                    normalizedKey: '$normalizedKey',
                    categoryId: '$categoryId',
                },
                categoryTitle: { $first: '$categoryTitle' },
                frequency: { $sum: 1 },
                lastUsedAt: { $max: '$updatedAt' },
            },
        },
        {
            $sort: {
                '_id.normalizedKey': 1 as const,
                frequency: -1 as const,
                lastUsedAt: -1 as const,
            },
        },
        {
            $group: {
                _id: '$_id.normalizedKey',
                preferredCategoryId: { $first: '$_id.categoryId' },
                preferredCategoryTitle: { $first: '$categoryTitle' },
                frequency: { $first: '$frequency' },
                lastUsedAt: { $first: '$lastUsedAt' },
            },
        },
        { $sort: { lastUsedAt: -1 as const } },
    ]

    const results = await transactions.aggregate(pipeline).toArray()

    return results.map((r) => ({
        keyword: r._id,
        preferredCategoryId: r.preferredCategoryId,
        preferredCategoryTitle: r.preferredCategoryTitle,
        frequency: r.frequency,
        lastUsedAt: r.lastUsedAt,
        confidence: r.frequency >= 2 ? 0.95 : 0.85,
    }))
}

/**
 * ดึงรายการธุรกรรมล่าสุดของผู้ใช้
 */
export async function getRecentTransactions(userId: string, limit = 20): Promise<TransactionDoc[]> {
    const { transactions } = getCollections()
    return transactions
        .find({ userId })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray()
}