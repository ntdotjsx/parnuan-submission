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
 * คำนวณระดับความมั่นใจ (Confidence Score) ของ Memory ตามสัดส่วนประวัติการใช้งาน:
 * - ประวัติ 1 รายการ: 0.85
 * - ประวัติ 2 รายการขึ้นไป และเป็นเอกฉันท์ (Unanimous): 0.95
 * - ประวัติที่มีความขัดแย้ง (Conflicting History): 0.70 + (best / total) * 0.20 (จำกัดช่วง 0.70 - 0.90)
 *
 * @param bestFrequency - จำนวนครั้งของหมวดหมู่ที่ชนะ (Majority Category)
 * @param totalFrequency - จำนวนครั้งรวมของทุกหมวดหมู่ที่ตรงกับ Normalized Key
 * @returns คะแนนความมั่นใจระหว่าง 0.70 ถึง 0.95
 */
export function calculateMemoryConfidence(bestFrequency: number, totalFrequency: number): number {
    if (totalFrequency <= 0 || bestFrequency <= 0) return 0
    if (totalFrequency === 1) return 0.85
    if (bestFrequency === totalFrequency) return 0.95

    const ratio = bestFrequency / totalFrequency
    const rawConfidence = 0.70 + ratio * 0.20
    const clamped = Math.max(0.70, Math.min(0.90, rawConfidence))
    return Math.round(clamped * 100) / 100
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
 * - บันทึกค่า memoryEligible ตามสถานะ Memory ขณะยืนยัน (เปิด = true, ปิด = false)
 * - ป้องกันการบันทึกรายการซ้ำที่มีชื่อเดียวกัน (Normalized Key) และเวลาวันเดียวกัน (Date) ของผู้ใช้คนเดียวกัน
 * - อนุญาตให้บันทึกรายการที่เวลาเดียวกันได้หากเป็นคนละชื่อ (Different Names)
 * - บันทึกลง Collection transactions ใน MongoDB เสมอ แม้ปิด Memory ก็ยังบันทึกประวัติไว้
 *
 * @param userId - รหัสผู้ใช้
 * @param items - รายการธุรกรรมที่ต้องการบันทึก
 * @returns สรุปผลการบันทึก จำนวนรายการที่บันทึก และจำนวนรายการซ้ำที่ถูกข้าม
 */
export async function learnTransactions(
    userId: string,
    items: LearnItemInput[],
): Promise<{ insertedCount: number; skippedDuplicates: number; insertedDocs: TransactionDoc[] }> {
    if (!items || items.length === 0) {
        return { insertedCount: 0, skippedDuplicates: 0, insertedDocs: [] }
    }

    const { transactions } = getCollections()
    const now = new Date()
    const memoryEnabled = await isMemoryEnabled(userId)

    /**
     * กรองรายการที่ซ้ำกันภายในชุดข้อมูลเดียวกัน (In-batch deduplication)
     * ซ้ำเมื่อ: normalizedKey เดียวกัน และ date เดียวกัน
     */
    const uniqueInBatch: LearnItemInput[] = []
    const seenBatchKeys = new Set<string>()
    let skippedInBatch = 0

    for (const item of items) {
        const normKey = normalizeMemoryKey(item.description)
        const dateStr = item.date ? new Date(item.date).toISOString() : now.toISOString()
        const dedupeKey = `${normKey}:::${dateStr}`

        if (seenBatchKeys.has(dedupeKey)) {
            skippedInBatch++
            continue
        }

        seenBatchKeys.add(dedupeKey)
        uniqueInBatch.push({ ...item, date: dateStr })
    }

    if (uniqueInBatch.length === 0) {
        return { insertedCount: 0, skippedDuplicates: skippedInBatch, insertedDocs: [] }
    }

    /**
     * ตรวจสอบความซ้ำซ้อนกับข้อมูลที่มีอยู่แล้วในฐานข้อมูล MongoDB
     */
    const candidateDocs: TransactionDoc[] = uniqueInBatch.map((item) => ({
        id: item.id || createId(),
        userId,
        description: item.description.trim(),
        normalizedKey: normalizeMemoryKey(item.description),
        amount: item.amount,
        categoryId: item.categoryId,
        categoryTitle: item.categoryTitle,
        date: item.date || now.toISOString(),
        memoryEligible: memoryEnabled,
        memoryExcluded: false,
        createdAt: now,
        updatedAt: now,
    }))

    const conditions = candidateDocs.map((doc) => ({
        userId,
        normalizedKey: doc.normalizedKey,
        date: doc.date,
    }))

    const existingDocs = await transactions
        .find({ $or: conditions })
        .toArray()

    const existingSet = new Set(
        existingDocs.map((doc) => `${doc.normalizedKey}:::${doc.date}`),
    )

    const docsToInsert = candidateDocs.filter(
        (doc) => !existingSet.has(`${doc.normalizedKey}:::${doc.date}`),
    )

    const totalSkipped = skippedInBatch + (candidateDocs.length - docsToInsert.length)

    if (docsToInsert.length > 0) {
        await transactions.insertMany(docsToInsert)
    }

    return {
        insertedCount: docsToInsert.length,
        skippedDuplicates: totalSkipped,
        insertedDocs: docsToInsert,
    }
}

/**
 * ค้นหาหมวดหมู่ที่เหมาะสมที่สุดจากประวัติความจำของผู้ใช้ โดยอาศัย MongoDB Aggregation Pipeline:
 * - กรองเฉพาะประวัติที่เป็นของ User ID และมี Normalized Key ตรงกัน
 * - กรองเฉพาะรายการที่ memoryEligible != false และ memoryExcluded != true
 * - จัดกลุ่มตามหมวดหมู่ เพื่อนับความถี่และค้นหาเวลาการใช้งานล่าสุด
 * - จัดเรียงลำดับโดยให้ความสำคัญกับความถี่สูงสุด (Majority) และความสดใหม่ของข้อมูล (Recency Tie-Breaker)
 * - คำนวณคะแนนความมั่นใจ (Confidence Score) ตามสัดส่วนประวัติการใช้งาน
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
                memoryEligible: { $ne: false },
                memoryExcluded: { $ne: true },
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
                _id: 1 as const,
            },
        },
    ]

    const results = await transactions.aggregate(pipeline).toArray()
    if (results.length === 0) return null

    const bestMatch = results[0]
    const totalFrequency = results.reduce((sum, item) => sum + (item.frequency || 0), 0)
    const confidence = calculateMemoryConfidence(bestMatch.frequency, totalFrequency)

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
 * - กำหนด memoryEligible เป็น true และ memoryExcluded เป็น false เพื่อให้เรียนรู้ทันที
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
                memoryEligible: true,
                memoryExcluded: false,
                updatedAt: new Date(),
            },
        },
    )
    return result.modifiedCount > 0
}

/**
 * รวบรวมและวิเคราะห์ข้อมูลความจำทั้งหมดของผู้ใช้เพื่อนำมาแสดงผล (Inspectable Memory):
 * - ประมวลผลกลุ่มคำศัพท์ทั้งหมดที่ผู้ใช้เคยบันทึกและไม่ถูกยกเว้น (Eligible & Not Excluded)
 * - ระบุหมวดหมู่ที่ใช้บ่อยที่สุดสำหรับแต่ละคำศัพท์ พร้อมคะแนนความมั่นใจตามสัดส่วน
 *
 * @param userId - รหัสผู้ใช้
 * @returns รายการวิเคราะห์ความจำของผู้ใช้
 */
export async function inspectUserMemory(userId: string): Promise<MemoryInsightItem[]> {
    const { transactions } = getCollections()

    const pipeline = [
        {
            $match: {
                userId,
                memoryEligible: { $ne: false },
                memoryExcluded: { $ne: true },
            },
        },
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
                '_id.categoryId': 1 as const,
            },
        },
        {
            $group: {
                _id: '$_id.normalizedKey',
                preferredCategoryId: { $first: '$_id.categoryId' },
                preferredCategoryTitle: { $first: '$categoryTitle' },
                frequency: { $first: '$frequency' },
                totalFrequency: { $sum: '$frequency' },
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
        confidence: calculateMemoryConfidence(r.frequency, r.totalFrequency),
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
 * ลบรายการธุรกรรมของผู้ใช้งานออกจากฐานข้อมูล (Transaction Deletion):
 * - ลบเฉพาะรายการที่เป็นของ userId นั้นๆ เพื่อความปลอดภัย (User Isolation)
 * - ป้องกันไม่ให้ผู้ใช้คนหนึ่งลบรายการของผู้ใช้อื่น
 * - เมื่อรายการถูกลบ การประมวลผลความจำ (Derived Memory) ในครั้งถัดไปจะสะท้อนตามประวัติธุรกรรมที่เหลืออยู่โดยอัตโนมัติ
 * - ไม่มีการแก้ไขหรือ rebuild ตารางความจำแยกต่างหาก เพราะความจำเป็น Derived View จาก transactions เสมอ
 *
 * @param userId - รหัสผู้ใช้
 * @param transactionId - รหัสรายการธุรกรรมที่ต้องการลบ
 * @returns true หากลบสำเร็จ หรือ false หากไม่พบรายการหรือไม่ใช่ของ user คนนี้
 */
export async function deleteTransaction(userId: string, transactionId: string): Promise<boolean> {
    const { transactions } = getCollections()
    const result = await transactions.deleteOne({
        id: transactionId,
        userId,
    })
    return result.deletedCount > 0
}
