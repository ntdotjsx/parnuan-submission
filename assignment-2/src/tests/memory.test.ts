import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest'
import { connectDb, closeDb, getCollections } from '../modules/db'
import {
    normalizeMemoryKey,
    isMemoryEnabled,
    setMemoryEnabled,
    learnTransactions,
    getMemoryMatch,
    updateTransactionCategory,
    inspectUserMemory,
    deleteUserMemoryKey,
    clearAllUserMemory,
} from '../modules/memory/service'

/**
 * Memory Layer Test Suite for Assignment 2
 *
 * ทดสอบการทำงานของ Memory Layer ที่สร้างขึ้นครอบทับ Parser
 * ครอบคลุมทั้งการ Normalize ข้อความ, การเรียนรู้แบบ Passive,
 * การอัปเดตความจำเมื่อแก้ไขประวัติในอดีต, การเปิดปิดความจำ,
 * และการแยกความจำรายบุคคล (Per-User Isolation)
 */
describe('Memory Layer Service', () => {
    /**
     * เริ่มต้นการเชื่อมต่อฐานข้อมูล MongoDB ก่อนเริ่มการทดสอบทั้งหมด
     */
    beforeAll(async () => {
        await connectDb()
    })

    /**
     * ทำความสะอาดข้อมูลทดสอบและปิดการเชื่อมต่อฐานข้อมูลหลังการทดสอบเสร็จสิ้น
     */
    afterAll(async () => {
        const { transactions, userSettings } = getCollections()
        await transactions.deleteMany({ userId: { $regex: '^test_' } })
        await userSettings.deleteMany({ userId: { $regex: '^test_' } })
        await closeDb()
    })

    /**
     * ล้างข้อมูลทดสอบที่มีคำนำหน้า test_ ก่อนเริ่มแต่ละเคสทดสอบ
     */
    beforeEach(async () => {
        const { transactions, userSettings } = getCollections()
        await transactions.deleteMany({ userId: { $regex: '^test_' } })
        await userSettings.deleteMany({ userId: { $regex: '^test_' } })
    })

    /**
     * การทดสอบส่วนการจัดรูปแบบข้อความ (Text Normalization)
     */
    describe('Text Normalization', () => {
        /**
         * ตรวจสอบว่าฟังก์ชัน normalizeMemoryKey สามารถตัดช่องว่างหัวท้าย,
         * แปลงเป็นตัวพิมพ์เล็ก, และยุบช่องว่างซ้ำซ้อนได้อย่างถูกต้อง
         */
        it('should trim, lowercase, and collapse multiple whitespaces', () => {
            expect(normalizeMemoryKey('  ข้าวมันไก่   พิเศษ  ')).toBe('ข้าวมันไก่ พิเศษ')
            expect(normalizeMemoryKey('  Grab   Food ')).toBe('grab food')
            expect(normalizeMemoryKey('')).toBe('')
        })
    })

    /**
     * การทดสอบ Flow การเรียนรู้แบบ Passive จากประวัติธุรกรรม
     */
    describe('Passive Learning from Transaction History', () => {
        /**
         * ตรวจสอบว่าเมื่อผู้ใช้ยืนยันรายการใหม่ ระบบจะเรียนรู้เข้า Memory โดยอัตโนมัติ
         * และสามารถดึงหมวดหมู่ที่จำได้พร้อม Confidence Score ระดับสูง
         */
        it('should learn passively from confirmed transactions and match memory', async () => {
            const testUserId = 'test_user_passive'

            const beforeMatch = await getMemoryMatch(testUserId, 'ข้าวมันไก่')
            expect(beforeMatch).toBeNull()

            await learnTransactions(testUserId, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                },
                {
                    description: 'ข้าวมันไก่',
                    amount: 60,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                },
            ])

            const afterMatch = await getMemoryMatch(testUserId, 'ข้าวมันไก่')
            expect(afterMatch).not.toBeNull()
            expect(afterMatch?.categoryId).toBe('food')
            expect(afterMatch?.categoryTitle).toBe('อาหาร')
            expect(afterMatch?.confidence).toBe(0.95)
            expect(afterMatch?.frequency).toBe(2)
            expect(afterMatch?.source).toBe('memory')
        })
    })

    /**
     * การทดสอบ Flow การอัปเดตความจำเมื่อมีการแก้ไขประวัติในอดีต
     */
    describe('Memory Updates on Past Transaction Edit', () => {
        /**
         * ตรวจสอบว่าเมื่อผู้ใช้แก้ไขหมวดหมู่ของรายการเดิมในอดีต
         * ความจำของระบบจะปรับเปลี่ยนตามการแก้ไขล่าสุดทันที
         */
        it('should update memory immediately when a past transaction category changes', async () => {
            const testUserId = 'test_user_edit'
            const transactionId = 'test-tx-edit-01'

            await learnTransactions(testUserId, [
                {
                    id: transactionId,
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                },
            ])

            const initialMatch = await getMemoryMatch(testUserId, 'ข้าวมันไก่')
            expect(initialMatch?.categoryId).toBe('food')

            const updateSuccess = await updateTransactionCategory(
                testUserId,
                transactionId,
                'other',
                'ข้าวเช้า',
            )
            expect(updateSuccess).toBe(true)

            const updatedMatch = await getMemoryMatch(testUserId, 'ข้าวมันไก่')
            expect(updatedMatch).not.toBeNull()
            expect(updatedMatch?.categoryId).toBe('other')
            expect(updatedMatch?.categoryTitle).toBe('ข้าวเช้า')
        })
    })

    /**
     * การทดสอบ Flow การเปิดและปิดใช้งานระบบความจำ
     */
    describe('Memory Settings Toggle', () => {
        /**
         * ตรวจสอบว่าเมื่อปิดการใช้งานความจำ ระบบจะคืนค่า null เพื่อให้ Fallback กลับไปใช้ Parser
         * และเมื่อเปิดกลับมา ความจำเดิมยังคงอยู่และทำงานได้ตามปกติ
         */
        it('should return null when memory is toggled off and resume when turned back on', async () => {
            const testUserId = 'test_user_toggle'

            await learnTransactions(testUserId, [
                {
                    description: 'กาแฟ',
                    amount: 60,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                },
            ])

            const enabledMatch = await getMemoryMatch(testUserId, 'กาแฟ')
            expect(enabledMatch).not.toBeNull()
            expect(enabledMatch?.categoryId).toBe('food')

            await setMemoryEnabled(testUserId, false)
            expect(await isMemoryEnabled(testUserId)).toBe(false)

            const disabledMatch = await getMemoryMatch(testUserId, 'กาแฟ')
            expect(disabledMatch).toBeNull()

            await setMemoryEnabled(testUserId, true)
            expect(await isMemoryEnabled(testUserId)).toBe(true)

            const reEnabledMatch = await getMemoryMatch(testUserId, 'กาแฟ')
            expect(reEnabledMatch).not.toBeNull()
            expect(reEnabledMatch?.categoryId).toBe('food')
        })
    })

    /**
     * การทดสอบการแยกความจำของผู้ใช้แต่ละคนออกจากกัน
     */
    describe('Per-User Memory Isolation', () => {
        /**
         * ตรวจสอบว่าความจำของผู้ใช้แต่ละคนเป็นอิสระต่อกัน ไม่ปะปนกัน
         * แม้จะใช้คำอธิบายรายการเดียวกันก็ตาม
         */
        it('should keep memories isolated between different users', async () => {
            const userNut = 'test_user_nut'
            const userTitle = 'test_user_title'

            await learnTransactions(userNut, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                },
            ])

            await learnTransactions(userTitle, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'shopping',
                    categoryTitle: 'ช้อปปิ้ง',
                },
            ])

            const matchNut = await getMemoryMatch(userNut, 'ข้าวมันไก่')
            const matchTitle = await getMemoryMatch(userTitle, 'ข้าวมันไก่')

            expect(matchNut?.categoryId).toBe('food')
            expect(matchNut?.categoryTitle).toBe('อาหาร')

            expect(matchTitle?.categoryId).toBe('shopping')
            expect(matchTitle?.categoryTitle).toBe('ช้อปปิ้ง')
        })
    })

    /**
     * การทดสอบการเรียกดูข้อมูลความจำทั้งหมดของผู้ใช้เพื่อความโปร่งใส
     */
    describe('Inspectable Memory State', () => {
        /**
         * ตรวจสอบว่าฟังก์ชัน inspectUserMemory สามารถดึงรายการคำศัพท์ที่เรียนรู้
         * พร้อมหมวดหมู่ที่แนะนำและความถี่ในการใช้งานได้อย่างถูกต้อง
         */
        it('should return aggregated memory list for user inspection', async () => {
            const testUserId = 'test_user_inspect'

            await learnTransactions(testUserId, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                },
                {
                    description: 'ข้าวมันไก่',
                    amount: 60,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                },
                {
                    description: 'bts หมอชิต',
                    amount: 45,
                    categoryId: 'transport',
                    categoryTitle: 'เดินทาง',
                },
            ])

            const memories = await inspectUserMemory(testUserId)
            expect(memories).toHaveLength(2)

            const chickenRice = memories.find((item) => item.keyword === 'ข้าวมันไก่')
            expect(chickenRice).toBeDefined()
            expect(chickenRice?.preferredCategoryId).toBe('food')
            expect(chickenRice?.frequency).toBe(2)
            expect(chickenRice?.confidence).toBe(0.95)

            const bts = memories.find((item) => item.keyword === 'bts หมอชิต')
            expect(bts).toBeDefined()
            expect(bts?.preferredCategoryId).toBe('transport')
            expect(bts?.frequency).toBe(1)
            expect(bts?.confidence).toBe(0.85)
        })
    })

    /**
     * การทดสอบการเรียนรู้หมวดหมู่เฉพาะมื้ออาหารและหมวดหมู่ที่ผู้ใช้สร้างเอง
     */
    describe('Custom & Meal Category Learning', () => {
        /**
         * ตรวจสอบว่าระบบสามารถเรียนรู้หมวดหมู่เฉพาะ เช่น ข้าวเช้า ข้าวเที่ยง หรือหมวดหมู่ที่ผู้ใช้พิมพ์เอง
         */
        it('should learn custom user categories and meal-specific categories', async () => {
            const testUserId = 'test_user_custom_cat'

            await learnTransactions(testUserId, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'breakfast',
                    categoryTitle: 'ข้าวเช้า',
                },
                {
                    description: 'ทรายแมว',
                    amount: 190,
                    categoryId: 'pet_supplies',
                    categoryTitle: 'อาหาร/ของใช้สัตว์เลี้ยง',
                },
            ])

            const matchBreakfast = await getMemoryMatch(testUserId, 'ข้าวมันไก่')
            expect(matchBreakfast).not.toBeNull()
            expect(matchBreakfast?.categoryId).toBe('breakfast')
            expect(matchBreakfast?.categoryTitle).toBe('ข้าวเช้า')

            const matchPet = await getMemoryMatch(testUserId, 'ทรายแมว')
            expect(matchPet).not.toBeNull()
            expect(matchPet?.categoryId).toBe('pet_supplies')
            expect(matchPet?.categoryTitle).toBe('อาหาร/ของใช้สัตว์เลี้ยง')
        })
    })

    /**
     * การทดสอบการลบความจำเฉพาะคำและการล้างความจำทั้งหมด
     */
    describe('Memory Deletion & Resetting', () => {
        /**
         * ตรวจสอบว่าสามารถลบความจำของคำเฉพาะได้อย่างถูกต้อง และคำอื่นๆ ยังคงอยู่
         */
        it('should delete memory for a specific keyword', async () => {
            const testUserId = 'test_user_delete_key'

            await learnTransactions(testUserId, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                },
                {
                    description: 'bts หมอชิต',
                    amount: 45,
                    categoryId: 'transport',
                    categoryTitle: 'เดินทาง',
                },
            ])

            expect(await getMemoryMatch(testUserId, 'ข้าวมันไก่')).not.toBeNull()

            const deletedCount = await deleteUserMemoryKey(testUserId, 'ข้าวมันไก่')
            expect(deletedCount).toBe(1)

            expect(await getMemoryMatch(testUserId, 'ข้าวมันไก่')).toBeNull()
            expect(await getMemoryMatch(testUserId, 'bts หมอชิต')).not.toBeNull()
        })

        /**
         * ตรวจสอบว่าสามารถล้างความจำทั้งหมดของผู้ใช้ได้
         */
        it('should clear all memories for a user', async () => {
            const testUserId = 'test_user_clear_all'

            await learnTransactions(testUserId, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                },
                {
                    description: 'bts หมอชิต',
                    amount: 45,
                    categoryId: 'transport',
                    categoryTitle: 'เดินทาง',
                },
            ])

            const deletedCount = await clearAllUserMemory(testUserId)
            expect(deletedCount).toBe(2)

            const memories = await inspectUserMemory(testUserId)
            expect(memories).toHaveLength(0)
        })
    })
})
