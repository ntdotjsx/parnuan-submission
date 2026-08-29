import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest'
import { connectDb, closeDb, getCollections } from '../modules/db'
import {
    normalizeMemoryKey,
    calculateMemoryConfidence,
    isMemoryEnabled,
    setMemoryEnabled,
    learnTransactions,
    getMemoryMatch,
    updateTransactionCategory,
    inspectUserMemory,
    getRecentTransactions,
    deleteUserMemoryKey,
    clearAllUserMemory,
} from '../modules/memory/service'

/**
 * Memory Layer Test Suite for Assignment 2
 *
 * ทดสอบการทำงานของ Memory Layer ที่สร้างขึ้นครอบทับ Parser
 * ครอบคลุมทั้งการ Normalize ข้อความ, การเรียนรู้แบบ Passive,
 * การคำนวณ Confidence Score ตามสัดส่วน, การแก้ปัญหาข้อขัดแย้ง (Majority + Recency),
 * การเปิด/ปิด Memory (Memory OFF = No learning & No applying),
 * การลืม/ล้างความจำแบบไม่ทำลายประวัติธุรกรรม (Non-destructive Forget & Reset),
 * และความเข้ากันได้ย้อนหลัง (Backward Compatibility)
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
        it('should trim, lowercase, and collapse multiple whitespaces', () => {
            expect(normalizeMemoryKey('  ข้าวมันไก่   พิเศษ  ')).toBe('ข้าวมันไก่ พิเศษ')
            expect(normalizeMemoryKey('  Grab   Food ')).toBe('grab food')
            expect(normalizeMemoryKey('')).toBe('')
        })
    })

    /**
     * การทดสอบการคำนวณคะแนนความมั่นใจ (Confidence Score Calculation)
     */
    describe('Confidence Score Calculation', () => {
        it('should return 0.85 for a single historical match', () => {
            expect(calculateMemoryConfidence(1, 1)).toBe(0.85)
        })

        it('should return 0.95 for unanimous matches with 2 or more occurrences', () => {
            expect(calculateMemoryConfidence(2, 2)).toBe(0.95)
            expect(calculateMemoryConfidence(5, 5)).toBe(0.95)
            expect(calculateMemoryConfidence(10, 10)).toBe(0.95)
        })

        it('should calculate proportional confidence (0.70 - 0.90) for conflicting history', () => {
            // อาหาร = 2, ข้าวเช้า = 1 (total = 3, ratio = 2/3 ≈ 0.667) -> 0.70 + 0.667 * 0.20 ≈ 0.83
            const conf3 = calculateMemoryConfidence(2, 3)
            expect(conf3).toBe(0.83)
            expect(conf3).toBeLessThan(0.95)
            expect(conf3).toBeGreaterThanOrEqual(0.70)

            // อาหาร = 1, ข้าวเช้า = 1 (total = 2, ratio = 0.5) -> 0.70 + 0.5 * 0.20 = 0.80
            const conf2 = calculateMemoryConfidence(1, 2)
            expect(conf2).toBe(0.80)

            // อาหาร = 5, ข้าวเช้า = 2 (total = 7, ratio = 5/7 ≈ 0.714) -> 0.70 + 0.714 * 0.20 ≈ 0.84
            const conf7 = calculateMemoryConfidence(5, 7)
            expect(conf7).toBe(0.84)
        })

        it('should return 0 for non-positive frequencies', () => {
            expect(calculateMemoryConfidence(0, 0)).toBe(0)
            expect(calculateMemoryConfidence(0, 5)).toBe(0)
        })
    })

    /**
     * CASE 1 — Flow การเรียนรู้แบบ Passive จากประวัติธุรกรรม (Memory ON learning)
     */
    describe('CASE 1 — Passive Learning when Memory is ON', () => {
        it('should learn passively from confirmed transactions and return suggested category', async () => {
            const testUserId = 'test_user_case1'

            const beforeMatch = await getMemoryMatch(testUserId, 'กาแฟ')
            expect(beforeMatch).toBeNull()

            await learnTransactions(testUserId, [
                {
                    description: 'กาแฟ',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                    date: '2026-08-28T12:00:00.000Z',
                },
                {
                    description: 'กาแฟ',
                    amount: 60,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                    date: '2026-08-29T12:00:00.000Z',
                },
            ])

            const afterMatch = await getMemoryMatch(testUserId, 'กาแฟ')
            expect(afterMatch).not.toBeNull()
            expect(afterMatch?.categoryId).toBe('food')
            expect(afterMatch?.categoryTitle).toBe('อาหาร')
            expect(afterMatch?.confidence).toBe(0.95)
            expect(afterMatch?.frequency).toBe(2)
            expect(afterMatch?.source).toBe('memory')
        })
    })

    /**
     * CASE 2 & CASE 3 & CASE 4 — การเปิด/ปิด Memory (Memory Disabled Behavior)
     */
    describe('Memory Settings Toggle & Learning Eligibility', () => {
        /**
         * CASE 2: Memory OFF does not apply (returns null so parser fallback is used)
         */
        it('CASE 2: should return null when memory is OFF even if memory exists', async () => {
            const testUserId = 'test_user_case2'

            await learnTransactions(testUserId, [
                {
                    description: 'กาแฟ',
                    amount: 60,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                },
            ])

            expect(await getMemoryMatch(testUserId, 'กาแฟ')).not.toBeNull()

            // ปิด Memory
            await setMemoryEnabled(testUserId, false)
            expect(await isMemoryEnabled(testUserId)).toBe(false)

            // ต้องคืนค่า null เพื่อให้ระบบ Fallback ไปใช้ Parser
            expect(await getMemoryMatch(testUserId, 'กาแฟ')).toBeNull()
        })

        /**
         * CASE 3: Memory OFF does not learn
         * บันทึกรายการขณะปิด Memory -> เมื่อเปิด Memory กลับมา รายการนั้นต้องไม่ถูกนำไปเป็น Memory Signal
         */
        it('CASE 3: transactions confirmed while Memory is OFF must NOT become learning signals', async () => {
            const testUserId = 'test_user_case3'

            // ปิด Memory ก่อนบันทึก
            await setMemoryEnabled(testUserId, false)
            expect(await isMemoryEnabled(testUserId)).toBe(false)

            // บันทึกรายการขณะ Memory OFF (เช่น เปลี่ยนหมวดเป็น shopping)
            const result = await learnTransactions(testUserId, [
                {
                    description: 'กาแฟคั่วบด',
                    amount: 250,
                    categoryId: 'shopping',
                    categoryTitle: 'ช้อปปิ้ง',
                },
            ])

            // ประวัติธุรกรรมต้องถูกบันทึกสำเร็จ
            expect(result.insertedCount).toBe(1)
            const recent = await getRecentTransactions(testUserId)
            expect(recent).toHaveLength(1)
            expect(recent[0].description).toBe('กาแฟคั่วบด')
            expect(recent[0].memoryEligible).toBe(false)

            // เปิด Memory กลับมา
            await setMemoryEnabled(testUserId, true)

            // รายการที่บันทึกขณะปิด Memory ต้องไม่กลายเป็นความจำ
            const memoryMatch = await getMemoryMatch(testUserId, 'กาแฟคั่วบด')
            expect(memoryMatch).toBeNull()

            const insights = await inspectUserMemory(testUserId)
            expect(insights.find((m) => m.keyword === 'กาแฟคั่วบด')).toBeUndefined()
        })

        /**
         * CASE 4: Turning Memory ON restores previous eligible memory
         * Memory ON -> learn กาแฟ:อาหาร -> Memory OFF -> confirm กาแฟ:ช้อปปิ้ง -> Memory ON
         * -> กาแฟ ยังคงเป็น อาหาร (รายการที่บันทึกตอน OFF ไม่กระทบ)
         */
        it('CASE 4: turning Memory ON restores previous eligible memory and ignores transactions created while OFF', async () => {
            const testUserId = 'test_user_case4'

            // Step 1: Memory ON -> บันทึก กาแฟ -> อาหาร
            await setMemoryEnabled(testUserId, true)
            await learnTransactions(testUserId, [
                {
                    description: 'กาแฟ',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                    date: '2026-08-27T10:00:00.000Z',
                },
                {
                    description: 'กาแฟ',
                    amount: 55,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                    date: '2026-08-28T10:00:00.000Z',
                },
            ])

            const match1 = await getMemoryMatch(testUserId, 'กาแฟ')
            expect(match1?.categoryId).toBe('food')
            expect(match1?.frequency).toBe(2)

            // Step 2: Memory OFF -> บันทึก กาแฟ -> ช้อปปิ้ง (3 ครั้ง)
            await setMemoryEnabled(testUserId, false)
            await learnTransactions(testUserId, [
                {
                    description: 'กาแฟ',
                    amount: 120,
                    categoryId: 'shopping',
                    categoryTitle: 'ช้อปปิ้ง',
                    date: '2026-08-29T10:00:00.000Z',
                },
                {
                    description: 'กาแฟ',
                    amount: 130,
                    categoryId: 'shopping',
                    categoryTitle: 'ช้อปปิ้ง',
                    date: '2026-08-29T14:00:00.000Z',
                },
                {
                    description: 'กาแฟ',
                    amount: 140,
                    categoryId: 'shopping',
                    categoryTitle: 'ช้อปปิ้ง',
                    date: '2026-08-29T18:00:00.000Z',
                },
            ])

            // ประวัติทั้งหมดต้องมี 5 รายการ
            const allTxs = await getRecentTransactions(testUserId, 10)
            expect(allTxs).toHaveLength(5)

            // Step 3: Memory ON -> ความจำต้องยังคงเป็น อาหาร จาก 2 รายการแรก
            await setMemoryEnabled(testUserId, true)
            const restoredMatch = await getMemoryMatch(testUserId, 'กาแฟ')
            expect(restoredMatch).not.toBeNull()
            expect(restoredMatch?.categoryId).toBe('food')
            expect(restoredMatch?.categoryTitle).toBe('อาหาร')
            expect(restoredMatch?.frequency).toBe(2)
        })
    })

    /**
     * CASE 5 — การแยกความจำของผู้ใช้แต่ละคน (Per-User Memory Isolation)
     */
    describe('CASE 5 — Per-User Memory Isolation', () => {
        it('should keep memories isolated between different users', async () => {
            const userA = 'test_user_a'
            const userB = 'test_user_b'

            await learnTransactions(userA, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'breakfast',
                    categoryTitle: 'ข้าวเช้า',
                },
            ])

            await learnTransactions(userB, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                },
            ])

            const matchA = await getMemoryMatch(userA, 'ข้าวมันไก่')
            const matchB = await getMemoryMatch(userB, 'ข้าวมันไก่')

            expect(matchA?.categoryId).toBe('breakfast')
            expect(matchA?.categoryTitle).toBe('ข้าวเช้า')

            expect(matchB?.categoryId).toBe('food')
            expect(matchB?.categoryTitle).toBe('อาหาร')
        })
    })

    /**
     * CASE 6 — Majority Vote & Conflicting History Confidence
     */
    describe('CASE 6 — Majority Vote & Conflict Confidence', () => {
        it('should resolve to majority category and calculate proportional confidence', async () => {
            const testUserId = 'test_user_case6'

            // บันทึก อาหาร 2 ครั้ง, ข้าวเช้า 1 ครั้ง
            await learnTransactions(testUserId, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                    date: '2026-08-27T10:00:00.000Z',
                },
                {
                    description: 'ข้าวมันไก่',
                    amount: 55,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                    date: '2026-08-28T10:00:00.000Z',
                },
                {
                    description: 'ข้าวมันไก่',
                    amount: 60,
                    categoryId: 'breakfast',
                    categoryTitle: 'ข้าวเช้า',
                    date: '2026-08-29T10:00:00.000Z',
                },
            ])

            const match = await getMemoryMatch(testUserId, 'ข้าวมันไก่')
            expect(match).not.toBeNull()
            expect(match?.categoryId).toBe('food')
            expect(match?.categoryTitle).toBe('อาหาร')
            expect(match?.frequency).toBe(2)
            // ความมั่นใจต้องสะท้อนข้อขัดแย้ง และต้องไม่ใช่ 0.95
            expect(match?.confidence).toBe(0.83)
            expect(match?.confidence).toBeLessThan(0.95)
        })
    })

    /**
     * CASE 7 — Recency Tie-Breaker
     */
    describe('CASE 7 — Recency Tie-Breaker', () => {
        it('should resolve tied frequencies using the most recently updated category', async () => {
            const testUserId = 'test_user_case7'
            const { transactions } = getCollections()

            const t1 = new Date('2026-08-28T10:00:00.000Z')
            const t2 = new Date('2026-08-29T10:00:00.000Z')

            // Insert 2 records with equal frequency (1 vs 1) but different updatedAt
            await transactions.insertMany([
                {
                    id: 'tx-tie-1',
                    userId: testUserId,
                    description: 'ก๋วยเตี๋ยว',
                    normalizedKey: 'ก๋วยเตี๋ยว',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                    date: t1.toISOString(),
                    memoryEligible: true,
                    memoryExcluded: false,
                    createdAt: t1,
                    updatedAt: t1,
                },
                {
                    id: 'tx-tie-2',
                    userId: testUserId,
                    description: 'ก๋วยเตี๋ยว',
                    normalizedKey: 'ก๋วยเตี๋ยว',
                    amount: 60,
                    categoryId: 'lunch',
                    categoryTitle: 'ข้าวเที่ยง',
                    date: t2.toISOString(),
                    memoryEligible: true,
                    memoryExcluded: false,
                    createdAt: t2,
                    updatedAt: t2,
                },
            ])

            const match = await getMemoryMatch(testUserId, 'ก๋วยเตี๋ยว')
            expect(match).not.toBeNull()
            // รายการล่าสุด (lunch / ข้าวเที่ยง) ต้องชนะ Tie-Breaker
            expect(match?.categoryId).toBe('lunch')
            expect(match?.categoryTitle).toBe('ข้าวเที่ยง')
            expect(match?.frequency).toBe(1)
            expect(match?.confidence).toBe(0.80)
        })
    })

    /**
     * CASE 8 — Forget One Memory Key (Non-destructive)
     */
    describe('CASE 8 — Non-destructive Single Key Forget', () => {
        it('should forget a memory key without deleting transactions from history', async () => {
            const testUserId = 'test_user_case8'

            await learnTransactions(testUserId, [
                {
                    description: 'กาแฟ',
                    amount: 50,
                    categoryId: 'drink',
                    categoryTitle: 'เครื่องดื่ม',
                },
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                },
            ])

            expect(await getMemoryMatch(testUserId, 'กาแฟ')).not.toBeNull()
            expect(await getMemoryMatch(testUserId, 'ข้าวมันไก่')).not.toBeNull()

            // ลืมเฉพาะคำว่า 'กาแฟ'
            const modifiedCount = await deleteUserMemoryKey(testUserId, 'กาแฟ')
            expect(modifiedCount).toBe(1)

            // กาแฟ ต้องไม่ถูกจดจำเป็น Memory แล้ว
            expect(await getMemoryMatch(testUserId, 'กาแฟ')).toBeNull()

            // ข้าวมันไก่ ต้องยังคงจำได้ตามปกติ
            const chickenMatch = await getMemoryMatch(testUserId, 'ข้าวมันไก่')
            expect(chickenMatch?.categoryId).toBe('food')

            // ประวัติธุรกรรมของกาแฟยังคงอยู่ในฐานข้อมูล ไม่ถูกลบจริง
            const recent = await getRecentTransactions(testUserId)
            expect(recent).toHaveLength(2)
            expect(recent.some((t) => t.description === 'กาแฟ')).toBe(true)
        })
    })

    /**
     * CASE 9 — Clear All Memory (Non-destructive)
     */
    describe('CASE 9 — Non-destructive Clear All Memory', () => {
        it('should clear all user memory while preserving all transaction records', async () => {
            const testUserId = 'test_user_case9'

            await learnTransactions(testUserId, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                    date: '2026-08-28T10:00:00.000Z',
                },
                {
                    description: 'bts หมอชิต',
                    amount: 45,
                    categoryId: 'transport',
                    categoryTitle: 'เดินทาง',
                    date: '2026-08-29T10:00:00.000Z',
                },
            ])

            const clearedCount = await clearAllUserMemory(testUserId)
            expect(clearedCount).toBe(2)

            // Memory Insights ต้องว่างเปล่า
            const insights = await inspectUserMemory(testUserId)
            expect(insights).toHaveLength(0)

            // getMemoryMatch ต้องคืนค่า null
            expect(await getMemoryMatch(testUserId, 'ข้าวมันไก่')).toBeNull()
            expect(await getMemoryMatch(testUserId, 'bts หมอชิต')).toBeNull()

            // ประวัติธุรกรรมทั้งหมดต้องยังอยู่ครบ 2 รายการ
            const recent = await getRecentTransactions(testUserId)
            expect(recent).toHaveLength(2)
        })
    })

    /**
     * CASE 10 — Editing Historical Transaction (Memory Synchronization)
     */
    describe('CASE 10 — Editing Historical Transaction Category', () => {
        it('should update memory immediately when a past transaction category changes', async () => {
            const testUserId = 'test_user_case10'
            const transactionId = 'test-tx-edit-case10'

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

            // แก้ไขหมวดหมู่ในอดีตเป็น 'ข้าวเช้า'
            const updateSuccess = await updateTransactionCategory(
                testUserId,
                transactionId,
                'breakfast',
                'ข้าวเช้า',
            )
            expect(updateSuccess).toBe(true)

            // รายการในอนาคตต้องเปลี่ยนตามทันที
            const updatedMatch = await getMemoryMatch(testUserId, 'ข้าวมันไก่')
            expect(updatedMatch).not.toBeNull()
            expect(updatedMatch?.categoryId).toBe('breakfast')
            expect(updatedMatch?.categoryTitle).toBe('ข้าวเช้า')
        })
    })

    /**
     * Backward Compatibility — รองรับ Transaction Document แบบเก่าที่ไม่มีฟิลด์ memoryEligible / memoryExcluded
     */
    describe('Backward Compatibility for Legacy Records', () => {
        it('should treat legacy documents without memoryEligible/memoryExcluded as eligible and active', async () => {
            const testUserId = 'test_user_legacy'
            const { transactions } = getCollections()
            const now = new Date()

            // บันทึกเอกสารแบบเก่าโดยตรงโดยไม่มีฟิลด์ memoryEligible และ memoryExcluded
            await transactions.insertOne({
                id: 'tx-legacy-01',
                userId: testUserId,
                description: 'ก๋วยเตี๋ยวคั่วไก่',
                normalizedKey: 'ก๋วยเตี๋ยวคั่วไก่',
                amount: 70,
                categoryId: 'food',
                categoryTitle: 'อาหาร',
                date: now.toISOString(),
                createdAt: now,
                updatedAt: now,
            } as any)

            const match = await getMemoryMatch(testUserId, 'ก๋วยเตี๋ยวคั่วไก่')
            expect(match).not.toBeNull()
            expect(match?.categoryId).toBe('food')
            expect(match?.categoryTitle).toBe('อาหาร')

            const insights = await inspectUserMemory(testUserId)
            expect(insights.some((item) => item.keyword === 'ก๋วยเตี๋ยวคั่วไก่')).toBe(true)
        })
    })

    /**
     * การทดสอบการป้องกันรายการซ้ำ (Deduplication Prevention)
     */
    describe('Deduplication Prevention', () => {
        it('should prevent recording duplicate transactions with same name and same date/time', async () => {
            const testUserId = 'test_user_dedupe_1'
            const sameDate = '2026-08-29T17:00:00.000Z'

            const firstResult = await learnTransactions(testUserId, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                    date: sameDate,
                },
            ])

            expect(firstResult.insertedCount).toBe(1)
            expect(firstResult.skippedDuplicates).toBe(0)

            const secondResult = await learnTransactions(testUserId, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                    date: sameDate,
                },
            ])

            expect(secondResult.insertedCount).toBe(0)
            expect(secondResult.skippedDuplicates).toBe(1)

            const recent = await getRecentTransactions(testUserId)
            expect(recent).toHaveLength(1)
        })

        it('should allow recording transactions with different names at the same date/time', async () => {
            const testUserId = 'test_user_dedupe_2'
            const sameDate = '2026-08-29T17:00:00.000Z'

            const result = await learnTransactions(testUserId, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                    date: sameDate,
                },
                {
                    description: 'น้ำเปล่า',
                    amount: 10,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                    date: sameDate,
                },
            ])

            expect(result.insertedCount).toBe(2)
            expect(result.skippedDuplicates).toBe(0)

            const recent = await getRecentTransactions(testUserId)
            expect(recent).toHaveLength(2)
        })

        it('should allow recording transactions with same name on different dates/times', async () => {
            const testUserId = 'test_user_dedupe_3'

            const result = await learnTransactions(testUserId, [
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                    date: '2026-08-28T12:00:00.000Z',
                },
                {
                    description: 'ข้าวมันไก่',
                    amount: 50,
                    categoryId: 'food',
                    categoryTitle: 'อาหาร',
                    date: '2026-08-29T12:00:00.000Z',
                },
            ])

            expect(result.insertedCount).toBe(2)
            expect(result.skippedDuplicates).toBe(0)

            const recent = await getRecentTransactions(testUserId)
            expect(recent).toHaveLength(2)
        })
    })
})
