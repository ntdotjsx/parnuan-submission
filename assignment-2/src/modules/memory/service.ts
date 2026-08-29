import { getCollections } from '../db'
import { TransactionDoc } from '../db/models'
import { createId } from '../utils'

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

export interface MemoryMatchResult {
    categoryId: string
    categoryTitle: string
    confidence: number
    frequency: number
    lastUsedAt: Date
    source: 'memory'
}


/**
 * ฟังก์ชัน Normalize ข้อความสำหรับใช้เป็น Key ของ Memory
 * - ตัดเว้นวรรคหัวท้าย
 * - แปลงเป็นตัวพิมพ์เล็ก (กรณีภาษาอังกฤษ)
 * - ยุบเว้นวรรคที่ซ้ำซ้อน
 */
export function normalizeMemoryKey(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * ตรวจสอบว่าผู้ใช้เปิดใช้งาน Memory หรือไม่ ค่าเริ่มต้นคือ true
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
                updatedAt: new Date()
            }
        },
        { upsert: true }
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
    // ป้องกันกรณีส่ง Array ว่างเข้ามา
    if (!items || items.length === 0) return
    const { transactions } = getCollections()
    const now = new Date()
    // แปลงข้อมูลแต่ละรายการให้อยู่ในรูป Database Document
    const docs: TransactionDoc[] = items.map((item) => ({
        id: item.id || createId(),
        userId,
        description: item.description.trim(),
        normalizedKey: normalizeMemoryKey(item.description), // ใช้ Key ที่ Normalize แล้ว
        amount: item.amount,
        categoryId: item.categoryId,
        categoryTitle: item.categoryTitle,
        date: item.date || now.toISOString(),
        createdAt: now,
        updatedAt: now,
    }))
    // บันทึกทั้งหมดลง MongoDB ในคำสั่งเดียว (Batch Insert)
    await transactions.insertMany(docs)
}

/**
 * ฟังก์ชันค้นหาหมวดหมู่จาก Memory ผ่าน MongoDB Aggregation
 * @param userId - รหัสผู้ใช้
 * @param description - ข้อความที่ผู้ใช้พิมพ์เข้ามา (เช่น "ข้าวมันไก่")
 * @returns ผลลัพธ์หมวดหมู่ที่จำได้ หรือ null ถ้าไม่พบประวัติ / ปิดความจำ
 */
export async function getMemoryMatch(
    userId: string,
    description: string,
): Promise<MemoryMatchResult | null> {
    // ตรวจสอบว่าผู้ใช้เปิดโหมดความจำหรือไม่ (ถ้าปิด ให้ข้ามไปเลย)
    const enabled = await isMemoryEnabled(userId)
    if (!enabled) return null
    // Normalize ข้อความคำค้น
    const normalizedKey = normalizeMemoryKey(description)
    if (!normalizedKey) return null
    const { transactions } = getCollections()
    // รัน Aggregation Pipeline 4 ขั้นตอน
    const pipeline = [
        // กรองเฉพาะประวัติของผู้ใช้คนนี้ และคำที่ตรงกัน
        {
            $match: {
                userId,
                normalizedKey,
            },
        },
        // จัดกลุ่มตาม Category เพื่อหาความถี่และเวลาล่าสุด
        {
            $group: {
                _id: '$categoryId',
                categoryTitle: { $first: '$categoryTitle' },
                frequency: { $sum: 1 },
                lastUsedAt: { $max: '$updatedAt' },
            },
        },
        // เรียงลำดับความถี่สูงสุด และความสดใหม่ล่าสุด
        {
            $sort: {
                frequency: -1 as const,
                lastUsedAt: -1 as const,
            },
        },
        // เอาเฉพาะหมวดหมู่อันดับ 1
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