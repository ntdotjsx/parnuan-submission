import { getCollections } from '../db'

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