import type { Category } from '../parser/types'

/**
 * รายการหมวดหมู่มาตรฐานของระบบ
 *
 * รองรับทั้งหมวดหมู่ทั่วไปและหมวดหมู่เฉพาะมื้ออาหาร (ตาม Requirement ของ Assignment 2):
 * เช่น ผู้ใช้บางคนบันทึกข้าวมันไก่เป็น 'อาหาร' บางคนแยกเป็น 'ข้าวเช้า', 'ข้าวเที่ยง', 'ข้าวเย็น'
 */
export const CATEGORIES: Category[] = [
    {
        id: 'food',
        title: 'อาหาร',
    },
    {
        id: 'shopping',
        title: 'ช้อปปิ้ง',
    },
    {
        id: 'transport',
        title: 'ขนส่ง/เดินทาง',
    },
    {
        id: 'other',
        title: 'อื่นๆ',
    },
]

/**
 * คำสำคัญ (Keywords) สำหรับ Parser เริ่มต้นของแต่ละหมวดหมู่
 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
    food: [
        'ข้าว',
        'อาหาร',
        'น้ำ',
        'กาแฟ',
        'ก๋วยเตี๋ยว',
        'ข้าวมันไก่',
    ],

    shopping: [
        'ช้อปปิ้ง',
        'ซื้อของ',
        'เสื้อผ้า',
    ],

    transport: [
        'แท็กซี่',
        'รถ',
        'ค่าเดินทาง',
        'bts',
        'mrt',
    ],
}

/**
 * แปลงข้อความหมวดหมู่ที่ผู้ใช้ป้อนเข้ามา (ทั้งจาก Dropdown หรือพิมพ์เอง) ให้เป็น Category Object:
 * - หากตรงกับ id ใน CATEGORIES จะคืนค่านั้น
 * - หากตรงกับ title ใน CATEGORIES จะคืนค่านั้น
 * - หากเป็นหมวดหมู่ใหม่ที่ผู้ใช้สร้างเอง จะสร้าง Category Object ให้โดยอัตโนมัติ
 */
export function resolveCategory(input: string): Category {
    const trimmed = (input || '').trim()
    if (!trimmed) {
        return { id: 'other', title: 'อื่นๆ' }
    }

    const matchedById = CATEGORIES.find(
        (c) => c.id.toLowerCase() === trimmed.toLowerCase(),
    )
    if (matchedById) return matchedById

    const matchedByTitle = CATEGORIES.find(
        (c) => c.title.toLowerCase() === trimmed.toLowerCase(),
    )
    if (matchedByTitle) return matchedByTitle

    return {
        id: trimmed.toLowerCase().replace(/\s+/g, '_'),
        title: trimmed,
    }
}
