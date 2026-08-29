import { Hono } from 'hono'
import { parseTransactions } from '../modules/parser/transaction'
import { rateLimiter } from '../middlewares/rate-limit'
import {
    getMemoryMatch,
    learnTransactions,
    updateTransactionCategory,
    inspectUserMemory,
    setMemoryEnabled,
    isMemoryEnabled,
    getRecentTransactions,
    resolveUser,
    getAllUsers,
} from '../modules/memory/service'
import { CATEGORIES } from '../modules/constants/categories'

export const apiRouter = new Hono()

/**
 * กำหนดความยาวตัวอักษรสูงสุดของข้อความที่ส่งเข้ามาประมวลผล
 * เพื่อป้องกันปัญหา Regular Expression Denial of Service (ReDoS) และ Server Overload
 */
const MAX_TEXT_LENGTH = 5_000

/**
 * ฟังก์ชันตัวช่วยสำหรับค้นหาชื่อหมวดหมู่ภาษาไทยจาก Category ID
 * หากไม่พบหมวดหมู่ในระบบ จะคืนค่า Category ID เดิมกลับไป
 */
const getCategoryTitle = (catId: string): string => {
    const found = CATEGORIES.find((category) => category.id === catId)
    return found ? found.title : catId
}

/**
 * Route: GET /api/users
 *
 * ดึงรายชื่อผู้ใช้งานทั้งหมดที่ถูก Seed ไว้ในฐานข้อมูล
 * ใช้สำหรับแสดงผลใน Dropdown ของหน้าเว็บ หรือส่งให้ Client เลือก User ID
 *
 * @param c - Context ของ Hono Framework
 * @returns รายการผู้ใช้ทั้งหมดในรูปแบบ JSON Array
 */
apiRouter.get('/users', async (c) => {
    const users = await getAllUsers()
    return c.json({ users })
})

/**
 * Route: POST /api/parse
 *
 * แปลงข้อความดิบเป็นรายการธุรกรรม (Transactions) โดยทำงานร่วมกับ Memory Layer:
 * - ตรวจสอบ Header Content-Type และความถูกต้องของ Request Body
 * - ตรวจสอบตัวตนของ User ID กับฐานข้อมูล
 * - ทำการ Parse ข้อความด้วย Default Rule-based Parser เป็นขั้นตอนแรก
 * - ตรวจสอบประวัติความจำของผู้ใช้คนดังกล่าว หากพบประวัติที่ตรงกันจะทำการ Override หมวดหมู่เดิม
 *
 * @param c - Context ของ Hono Framework ที่มี Request Body { text: string, userId?: string }
 * @returns รายการ Transactions ที่ผ่านการจัดหมวดหมู่แล้ว พร้อมระดับ Confidence Score
 */
apiRouter.post('/parse', rateLimiter({ windowMs: 60_000, max: 60 }), async (c) => {
    const contentType = c.req.header('content-type') || ''
    if (!contentType.includes('application/json')) {
        return c.json({ error: 'Content-Type must be application/json' }, 415)
    }

    let body: { text?: unknown; userId?: string }
    try {
        body = await c.req.json()
    } catch {
        return c.json({ error: 'Invalid JSON body' }, 400)
    }

    if (!body || typeof body.text !== 'string' || !body.text.trim()) {
        return c.json({ error: 'text is required and must be a non-empty string' }, 400)
    }

    if (body.text.length > MAX_TEXT_LENGTH) {
        return c.json({ error: `text is too long (maximum ${MAX_TEXT_LENGTH} characters)` }, 400)
    }

    /**
     * ดึงค่า User ID จาก Body หรือ Header และทำการตรวจสอบความมีอยู่จริงในฐานข้อมูล
     */
    const rawUserId = body.userId?.trim() || c.req.header('x-user-id')
    const user = await resolveUser(rawUserId)
    if (!user) {
        return c.json({
            error: `User '${rawUserId}' not found in database.`,
            hint: 'Use GET /api/users to see available users.',
        }, 404)
    }

    /**
     * ดำเนินการ Parse ข้อความผ่าน Rule-based Parser เริ่มต้น
     */
    const defaultTransactions = parseTransactions(body.text)

    /**
     * ค้นหาความจำของผู้ใช้สำหรับแต่ละรายการ เพื่อทำการ Override หากมีข้อมูลในอดีต
     */
    const transactions = await Promise.all(
        defaultTransactions.map(async (transaction) => {
            const memoryMatch = await getMemoryMatch(user.id, transaction.description)

            if (memoryMatch) {
                return {
                    ...transaction,
                    category: {
                        id: memoryMatch.categoryId,
                        title: memoryMatch.categoryTitle,
                    },
                    confidence: memoryMatch.confidence,
                    source: 'memory' as const,
                }
            }

            return {
                ...transaction,
                source: 'parser' as const,
            }
        }),
    )

    return c.json({
        user: { id: user.id, name: user.name },
        memoryEnabled: await isMemoryEnabled(user.id),
        transactions,
    })
})

/**
 * Route: POST /api/confirm
 *
 * ยืนยันการบันทึกรายการธุรกรรมลงฐานข้อมูล (Passive Learning):
 * - ตรวจสอบความถูกต้องของแต่ละรายการ (ชื่อรายการไม่ว่าง และจำนวนเงินมากกว่าศูนย์)
 * - บันทึกประวัติลง Collection transactions เพื่อเป็น Learning Signal ให้ระบบจดจำ
 *
 * @param c - Context ของ Hono Framework ที่มี Request Body { userId?: string, transactions: Array }
 * @returns สถานะการบันทึกสำเร็จและจำนวนรายการที่ถูกบันทึก
 */
apiRouter.post('/confirm', async (c) => {
    let body: {
        userId?: string
        transactions?: Array<{
            id?: string
            description: string
            amount: number
            categoryId: string
            categoryTitle?: string
            date?: string
        }>
    }

    try {
        body = await c.req.json()
    } catch {
        return c.json({ error: 'Invalid JSON body' }, 400)
    }

    /**
     * ตรวจสอบตัวตนของ User ID กับฐานข้อมูลก่อนทำการบันทึก
     */
    const rawUserId = body.userId?.trim() || c.req.header('x-user-id')
    const user = await resolveUser(rawUserId)
    if (!user) {
        return c.json({
            error: `User '${rawUserId}' not found in database.`,
            hint: 'Use GET /api/users to see available users.',
        }, 404)
    }

    const items = body.transactions

    if (!Array.isArray(items) || items.length === 0) {
        return c.json({ error: 'transactions must be a non-empty array' }, 400)
    }

    /**
     * คัดกรองและจัดรูปแบบเฉพาะรายการที่มีข้อมูลถูกต้องสมบูรณ์
     */
    const validItems = items
        .filter((item) => {
            const isDescValid = typeof item.description === 'string' && item.description.trim().length > 0
            const isAmountValid = Number.isFinite(item.amount) && item.amount > 0
            return isDescValid && isAmountValid
        })
        .map((item) => ({
            id: item.id,
            description: item.description.trim(),
            amount: item.amount,
            categoryId: item.categoryId || 'other',
            categoryTitle: item.categoryTitle || getCategoryTitle(item.categoryId || 'other'),
            date: item.date,
        }))

    if (validItems.length === 0) {
        return c.json({ error: 'No valid transactions to confirm' }, 400)
    }

    /**
     * ส่งรายการที่ผ่านการตรวจสอบเข้าสู่ระบบ Passive Learning
     */
    await learnTransactions(user.id, validItems)

    return c.json({
        success: true,
        user: { id: user.id, name: user.name },
        message: `Successfully confirmed and learned ${validItems.length} transactions for ${user.name}`,
        count: validItems.length,
    })
})

/**
 * Route: PATCH /api/transactions/:id
 *
 * แก้ไขหมวดหมู่ของรายการธุรกรรมในอดีต (Memory Sync):
 * - ค้นหารายการตาม ID และทำการอัปเดตหมวดหมู่ใหม่
 * - ปรับปรุงค่า updatedAt เพื่อให้การคำนวณความสดใหม่ของความจำปรับเปลี่ยนตามการแก้ไขล่าสุดทันที
 *
 * @param c - Context ของ Hono Framework พร้อม Param id และ Request Body { categoryId: string }
 * @returns ข้อมูลผลการอัปเดตและหมวดหมู่ใหม่
 */
apiRouter.patch('/transactions/:id', async (c) => {
    const id = c.req.param('id')
    let body: { userId?: string; categoryId?: string; categoryTitle?: string }

    try {
        body = await c.req.json()
    } catch {
        return c.json({ error: 'Invalid JSON body' }, 400)
    }

    /**
     * ตรวจสอบตัวตนของ User ID กับฐานข้อมูล
     */
    const rawUserId = body.userId?.trim() || c.req.header('x-user-id')
    const user = await resolveUser(rawUserId)
    if (!user) {
        return c.json({ error: `User '${rawUserId}' not found in database.` }, 404)
    }

    if (!body.categoryId || typeof body.categoryId !== 'string') {
        return c.json({ error: 'categoryId is required' }, 400)
    }

    const newCategoryTitle = body.categoryTitle || getCategoryTitle(body.categoryId)
    const success = await updateTransactionCategory(user.id, id, body.categoryId, newCategoryTitle)

    if (!success) {
        return c.json({ error: 'Transaction not found or not modified' }, 404)
    }

    return c.json({
        success: true,
        user: { id: user.id, name: user.name },
        message: 'Transaction updated and memory synchronized',
        updatedTransactionId: id,
        newCategory: { id: body.categoryId, title: newCategoryTitle },
    })
})

/**
 * Route: GET /api/memory
 *
 * ดึงข้อมูลความจำทั้งหมดที่ระบบได้เรียนรู้ของผู้ใช้ (Inspectable Memory):
 * - ใช้ MongoDB Aggregation Pipeline รวบรวมคีย์คำศัพท์และความถี่ในการจัดหมวดหมู่
 * - แสดงผลลัพธ์เพื่อความโปร่งใสและให้ผู้ใช้ตรวจสอบได้
 *
 * @param c - Context ของ Hono Framework พร้อม Query Param ?userId=...
 * @returns รายการความจำทั้งหมดพร้อมค่า Confidence Score และความถี่ในการใช้งาน
 */
apiRouter.get('/memory', async (c) => {
    const rawUserId = c.req.query('userId') || c.req.header('x-user-id')
    const user = await resolveUser(rawUserId)
    if (!user) {
        return c.json({ error: `User '${rawUserId}' not found in database.` }, 404)
    }

    const enabled = await isMemoryEnabled(user.id)
    const memories = await inspectUserMemory(user.id)

    return c.json({
        user: { id: user.id, name: user.name },
        memoryEnabled: enabled,
        totalLearnedKeywords: memories.length,
        memories,
    })
})

/**
 * Route: POST /api/settings/memory
 *
 * สลับการตั้งค่า เปิด หรือ ปิด การจัดหมวดหมู่ด้วยความจำ (Memory Toggle):
 * - เมื่อปิดการใช้งาน ระบบจะกลับไปใช้ Default Rule-based Parser
 * - เมื่อเปิดการใช้งาน ระบบจะนำความจำจากประวัติกลับมาช่วยจัดหมวดหมู่อัตโนมัติ
 *
 * @param c - Context ของ Hono Framework พร้อม Request Body { enabled: boolean }
 * @returns สถานะการตั้งค่าล่าสุดของผู้ใช้
 */
apiRouter.post('/settings/memory', async (c) => {
    let body: { userId?: string; enabled?: boolean }
    try {
        body = await c.req.json()
    } catch {
        return c.json({ error: 'Invalid JSON body' }, 400)
    }

    /**
     * ตรวจสอบตัวตนของ User ID กับฐานข้อมูล
     */
    const rawUserId = body.userId?.trim() || c.req.header('x-user-id')
    const user = await resolveUser(rawUserId)
    if (!user) {
        return c.json({ error: `User '${rawUserId}' not found in database.` }, 404)
    }

    if (typeof body.enabled !== 'boolean') {
        return c.json({ error: 'enabled must be a boolean (true or false)' }, 400)
    }

    await setMemoryEnabled(user.id, body.enabled)

    return c.json({
        success: true,
        user: { id: user.id, name: user.name },
        memoryEnabled: body.enabled,
        message: body.enabled ? 'จัดหมวดด้วยความจำ: เปิดใช้งานแล้ว' : 'จัดหมวดด้วยความจำ: ปิดใช้งานแล้ว',
    })
})

/**
 * Route: GET /api/transactions
 *
 * ดึงรายการธุรกรรมล่าสุดของผู้ใช้จากฐานข้อมูล
 * ใช้สำหรับตรวจสอบประวัติการบันทึก และนำไปใช้ในการเลือกแก้ไขหมวดหมู่
 *
 * @param c - Context ของ Hono Framework พร้อม Query Param ?userId=...&limit=...
 * @returns รายการธุรกรรมล่าสุดเรียงลำดับจากใหม่ไปเก่า
 */
apiRouter.get('/transactions', async (c) => {
    const rawUserId = c.req.query('userId') || c.req.header('x-user-id')
    const user = await resolveUser(rawUserId)
    if (!user) {
        return c.json({ error: `User '${rawUserId}' not found in database.` }, 404)
    }

    const limit = parseInt(c.req.query('limit') || '20', 10)
    const transactions = await getRecentTransactions(user.id, limit)

    return c.json({
        user: { id: user.id, name: user.name },
        count: transactions.length,
        transactions,
    })
})
