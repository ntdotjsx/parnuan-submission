import { getCollections } from '../db'
import type { TransactionDoc, UserDoc } from '../db/models'
import { createId } from '../utils'

/**
 * รหัสผู้ใช้งานหลักเริ่มต้น กรณีที่ไคลเอนต์ไม่ได้ระบุ User ID เข้ามา
 */
export const DEFAULT_USER_ID = 'user_nut'

/**
 * โครงสร้างข้อมูลผลลัพธ์การจับคู่หมวดหมู่จาก Memory Layer
 */
export interface MemoryMatchResult {
    categoryId: string
    categoryTitle: string
    confidence: number
    frequency: number
    lastUsedAt: Date
    source: 'memory'
}

/**
 * โครงสร้างข้อมูลสำหรับแสดงผลการวิเคราะห์ความจำของผู้ใช้
 */
export interface MemoryInsightItem {
    keyword: string
    preferredCategoryId: string
    preferredCategoryTitle: string
    frequency: number
    lastUsedAt: Date
    confidence: number
}

/**
 * โครงสร้างข้อมูล Input สำหรับการเรียนรู้รายการธุรกรรมใหม่
 */
export interface LearnItemInput {
    id?: string
    description: string
    amount: number
    categoryId: string
    categoryTitle: string
    date?: string
}

/**
 * ฟังก์ชันปรับแต่งข้อความดิบให้เป็นรูปแบบมาตรฐาน (Normalization) สำหรับใช้เป็น Key:
 * - ตัดช่องว่างส่วนเกินที่หัวและท้ายข้อความ
 * - แปลงตัวอักษรภาษาอังกฤษทั้งหมดเป็นตัวพิมพ์เล็ก
 * - ยุบช่องว่างที่ซ้ำซ้อนภายในข้อความให้เหลือเพียงช่องว่างเดี่ยว
 *
 * @param text - ข้อความคำอธิบายรายการ
 * @returns ข้อความในรูปแบบ Normalized Key
 */
export function normalizeMemoryKey(text: string): string {
    if (!text || typeof text !== 'string') return ''
    return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * ดึงรายชื่อผู้ใช้งานทั้งหมดที่มีในฐานข้อมูล
 *
 * @returns รายการ User Documents ทั้งหมด
 */
export async function getAllUsers(): Promise<UserDoc[]> {
    const { users } = getCollections()
    return users.find().toArray()
}

/**
 * ตรวจสอบและค้นหาผู้ใช้ในฐานข้อมูล:
 * - หากมีการระบุ User ID เข้ามา จะทำการค้นหาใน Collection users ว่ามีอยู่จริงหรือไม่
 * - หากไม่ระบุ User ID จะใช้รหัสผู้ใช้หลักเริ่มต้น (DEFAULT_USER_ID)
 *
 * @param userIdInput - รหัสผู้ใช้ที่ส่งเข้ามาจาก Request
 * @returns User Document หากพบ หรือ null หากไม่พบข้อมูลในระบบ
 */
export async function resolveUser(userIdInput?: string): Promise<UserDoc | null> {
    const { users } = getCollections()
    const targetId = userIdInput?.trim() || DEFAULT_USER_ID
    return users.findOne({ id: targetId })
}

/**
 * ตรวจสอบสถานะการเปิดหรือปิดใช้งาน Memory ของผู้ใช้
 * โดยค่าเริ่มต้นของระบบจะถือว่าเปิดใช้งานอยู่เสมอ (true) หากยังไม่มีการตั้งค่าบันทึกไว้
 *
 * @param userId - รหัสผู้ใช้
 * @returns สถานะการเปิดใช้งาน (true คือเปิด, false คือปิด)
 */
export async function isMemoryEnabled(userId: string): Promise<boolean> {
    const { userSettings } = getCollections()
    const setting = await userSettings.findOne({ userId })
    return setting ? setting.memoryEnabled : true
}

/**
 * บันทึกการเปลี่ยนแปลงสถานะ เปิด หรือ ปิด ใช้งาน Memory ของผู้ใช้ลงฐานข้อมูล
 *
 * @param userId - รหัสผู้ใช้
 * @param enabled - สถานะใหม่ที่ต้องการตั้งค่า
 * @returns สถานะที่ถูกบันทึกสำเร็จ
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
 * เรียนรู้และบันทึกประวัติรายการธุรกรรมที่ได้รับการยืนยันแล้วเข้าสู่ฐานข้อมูล (Passive Learning):
 * - แปลงข้อมูลเป็น Transaction Document พร้อมคำนวณ Normalized Key
 * - บันทึกลง Collection transactions ใน MongoDB เพื่อเป็นแหล่งข้อมูลหลักของ Memory
 *
 * @param userId - รหัสผู้ใช้
 * @param items - รายการธุรกรรมที่ต้องการบันทึก
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
 * ค้นหาหมวดหมู่ที่เหมาะสมที่สุดจากประวัติความจำของผู้ใช้ โดยอาศัย MongoDB Aggregation Pipeline:
 * - กรองเฉพาะประวัติที่เป็นของ User ID และมี Normalized Key ตรงกัน
 * - จัดกลุ่มตามหมวดหมู่ เพื่อนับความถี่และค้นหาเวลาการใช้งานล่าสุด
 * - จัดเรียงลำดับโดยให้ความสำคัญกับความถี่สูงสุด และความสดใหม่ของข้อมูล
 * - คำนวณคะแนนความมั่นใจ (Confidence Score) ตามความถี่การใช้งาน
 *
 * @param userId - รหัสผู้ใช้
 * @param description - ข้อความคำอธิบายรายการที่ต้องการค้นหา
 * @returns ข้อมูลการจับคู่หมวดหมู่ หรือ null หากไม่พบประวัติหรือปิดใช้งานความจำ
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

    /**
     * กำหนดระดับความมั่นใจ:
     * มีประวัติซ้ำตั้งแต่สองครั้งขึ้นไป ได้รับค่า 0.95
     * มีประวัติเพียงครั้งเดียว ได้รับค่า 0.85
     */
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
 * แก้ไขหมวดหมู่ของรายการธุรกรรมที่มีอยู่เดิมในอดีต (Memory Synchronization):
 * - อัปเดต Category ID และชื่อหมวดหมู่ใหม่
 * - ปรับปรุงค่าเวลา updatedAt ให้เป็นปัจจุบัน เพื่อให้การจับคู่ความจำสะท้อนการแก้ไขล่าสุด
 *
 * @param userId - รหัสผู้ใช้
 * @param transactionId - รหัสรายการธุรกรรมที่ต้องการแก้ไข
 * @param newCategoryId - รหัสหมวดหมู่ใหม่
 * @param newCategoryTitle - ชื่อหมวดหมู่ใหม่ภาษาไทย
 * @returns true หากการแก้ไขสำเร็จ หรือ false หากไม่พบรายการ
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
 * รวบรวมและวิเคราะห์ข้อมูลความจำทั้งหมดของผู้ใช้เพื่อนำมาแสดงผล (Inspectable Memory):
 * - ประมวลผลกลุ่มคำศัพท์ทั้งหมดที่ผู้ใช้เคยบันทึก
 * - ระบุหมวดหมู่ที่ใช้บ่อยที่สุดสำหรับแต่ละคำศัพท์ พร้อมคะแนนความมั่นใจ
 *
 * @param userId - รหัสผู้ใช้
 * @returns รายการวิเคราะห์ความจำของผู้ใช้
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
 * ดึงรายการประวัติธุรกรรมล่าสุดของผู้ใช้ เรียงลำดับจากรายการที่อัปเดตล่าสุด
 *
 * @param userId - รหัสผู้ใช้
 * @param limit - จำนวนรายการสูงสุดที่ต้องการดึง
 * @returns รายการ Transaction Documents ล่าสุด
 */
export async function getRecentTransactions(userId: string, limit = 20): Promise<TransactionDoc[]> {
    const { transactions } = getCollections()
    return transactions
        .find({ userId })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray()
}

/**
 * ลบความจำสำหรับคำศัพท์ที่ระบุของผู้ใช้:
 * ทำการลบรายการธุรกรรมที่มี normalizedKey ตรงกันสำหรับผู้ใช้นั้น
 *
 * @param userId - รหัสผู้ใช้
 * @param keyword - คำศัพท์ที่ต้องการลบ
 * @returns จำนวนรายการที่ถูกลบ
 */
export async function deleteUserMemoryKey(userId: string, keyword: string): Promise<number> {
    const { transactions } = getCollections()
    const normKey = normalizeMemoryKey(keyword)
    const result = await transactions.deleteMany({
        userId,
        normalizedKey: normKey,
    })
    return result.deletedCount
}

/**
 * ล้างความจำทั้งหมดของผู้ใช้:
 * ทำการลบรายการธุรกรรมทั้งหมดของผู้ใช้งานนั้น
 *
 * @param userId - รหัสผู้ใช้
 * @returns จำนวนรายการทั้งหมดที่ถูกลบ
 */
export async function clearAllUserMemory(userId: string): Promise<number> {
    const { transactions } = getCollections()
    const result = await transactions.deleteMany({ userId })
    return result.deletedCount
}