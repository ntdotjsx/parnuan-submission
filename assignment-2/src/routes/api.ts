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
const MAX_TEXT_LENGTH = 5_000

// Helper หาชื่อหมวดหมู่ภาษาไทยจาก ID
const getCategoryTitle = (catId: string): string => {
    const found = CATEGORIES.find((c) => c.id === catId)
    return found ? found.title : catId
}

/**
 * 0. GET /api/users
 * ดูรายชื่อผู้ใช้ทั้งหมดที่มีในระบบ (Seed Data)
 */
apiRouter.get('/users', async (c) => {
    const users = await getAllUsers()
    return c.json({ users })
})

/**
 * 1. POST /api/parse
 * แปลงข้อความเป็น Transactions พร้อมนำ Memory มาช่วยจัดหมวดหมู่อัตโนมัติ
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

    // ตรวจสอบ User ใน Database
    const rawUserId = body.userId?.trim() || c.req.header('x-user-id')
    const user = await resolveUser(rawUserId)
    if (!user) {
        return c.json({
            error: `User '${rawUserId}' not found in database.`,
            hint: 'Use GET /api/users to see available users.',
        }, 404)
    }

    // 1. แปลงข้อความด้วย Default Rule-based Parser
    const defaultTransactions = parseTransactions(body.text)

    // 2. ค้นหาใน Memory ว่าผู้ใช้คนนี้เคยบันทึกคำนี้ไว้หรือไม่
    const transactions = await Promise.all(
        defaultTransactions.map(async (t) => {
            const memoryMatch = await getMemoryMatch(user.id, t.description)

            if (memoryMatch) {
                // Override ด้วยหมวดหมู่จาก Memory
                return {
                    ...t,
                    category: {
                        id: memoryMatch.categoryId,
                        title: memoryMatch.categoryTitle,
                    },
                    confidence: memoryMatch.confidence,
                    source: 'memory' as const,
                }
            }

            return {
                ...t,
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
 * 2. POST /api/confirm (Demo Flow 1: Passive Learning)
 * ยืนยันบันทึกรายการลง Database และให้ระบบเรียนรู้เข้า Memory
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

    // ตรวจสอบ User ใน Database
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

    // Validate แต่ละรายการ
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

    // บันทึกลง MongoDB (Passive Learning)
    await learnTransactions(user.id, validItems)

    return c.json({
        success: true,
        user: { id: user.id, name: user.name },
        message: `Successfully confirmed and learned ${validItems.length} transactions for ${user.name}`,
        count: validItems.length,
    })
})

/**
 * 3. PATCH /api/transactions/:id (Demo Flow 2: Edit & Sync Memory)
 * แก้ไขหมวดหมู่ของรายการในอดีต -> ความจำจะอัปเดตตามทันที
 */
apiRouter.patch('/transactions/:id', async (c) => {
    const id = c.req.param('id')
    let body: { userId?: string; categoryId?: string; categoryTitle?: string }

    try {
        body = await c.req.json()
    } catch {
        return c.json({ error: 'Invalid JSON body' }, 400)
    }

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
 * 4. GET /api/memory (Inspectable Memory)
 * ดูข้อมูลความจำทั้งหมดที่ระบบเรียนรู้ของผู้ใช้
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
 * 5. POST /api/settings/memory (Demo Flow 3: Toggle Memory)
 * สลับการตั้งค่า เปิด/ปิด การจัดหมวดด้วยความจำ
 */
apiRouter.post('/settings/memory', async (c) => {
    let body: { userId?: string; enabled?: boolean }
    try {
        body = await c.req.json()
    } catch {
        return c.json({ error: 'Invalid JSON body' }, 400)
    }

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
 * 6. GET /api/transactions
 * ดูประวัติธุรกรรมล่าสุดของผู้ใช้
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
