import type { ObjectId } from 'mongodb'

/**
 * โครงสร้างข้อมูล Transaction ใน MongoDB (Collection: transactions)
 */
export interface TransactionDoc {
    _id?: ObjectId
    id: string                 // UUID ของ Transaction
    userId: string             // รหัสผู้ใช้ (เช่น "default-user")
    description: string        // เช่น "ข้าวมันไก่"
    normalizedKey: string      // คำที่ตัดเว้นวรรค/lowercase เพื่อใช้ในการจำ
    amount: number             // จำนวนเงิน เช่น 50
    categoryId: string         // รหัสหมวดหมู่ เช่น "food", "shopping"
    categoryTitle: string      // ชื่อหมวดหมู่ภาษาไทย เช่น "อาหาร"
    date: string               // วันที่ของรายการ (ISO String)
    createdAt: Date
    updatedAt: Date
}

/**
 * โครงสร้างการตั้งค่าผู้ใช้ (Collection: user_settings)
 */
export interface UserSettingsDoc {
    _id?: ObjectId
    userId: string
    memoryEnabled: boolean     // true = เปิดใช้ความจำ (default), false = ปิด
    updatedAt: Date
}

/**
 * โครงสร้างผลลัพธ์ความจำที่คำนวณได้ (Derived Memory View)
 */
export interface MemoryInsight {
    keyword: string            // คำที่จำได้ เช่น "ข้าวมันไก่"
    categoryId: string         // หมวดหมู่ที่จำได้ เช่น "food"
    categoryTitle: string      // "อาหาร"
    frequency: number          // จำนวนครั้งที่เคยบันทึก
    confidence: number         // คะแนนความมั่นใจที่คำนวณได้ (0.0 - 1.0)
    lastUsedAt: Date           // เวลาล่าสุดที่ใช้หมวดนี้
}