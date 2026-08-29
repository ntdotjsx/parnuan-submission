import { Hono } from 'hono'
import { parseTransactions } from '../modules/parser/transaction'
import { rateLimiter } from '../middlewares/rate-limit'
import {
    setMemoryEnabled,
    getMemoryMatch,
    isMemoryEnabled,
    learnTransactions
} from '../modules/memory/service'
import { getCategoryTitle } from '../modules/utils'

export const apiRouter = new Hono()

// จำกัดความยาวข้อความสูงสุดที่ยอมรับ (ป้องกัน ReDoS / Server DoS)
const MAX_TEXT_LENGTH = 5_000
// มา validate เพื่อป้องกันปัญหา เพราะว่า จะมีเรื่อง database เข้ามาเกี่ยวข้องแล้ว แต่จริงๆก็ควรทำตั้งแต่ assignment 1 แล้วผมขอโทษครับ

/**
 * POST /parse
 * Parses a string containing one or more transactions.
 * Each transaction is expected to contain a description and an amount.
 *
 * @param c - Hono context containing JSON payload: { text: string }
 * @returns 200 with parsed Transaction array, or 400 if validation fails.
 */
apiRouter.post('/parse', rateLimiter({ windowMs: 60_000, max: 30 }), async (c) => {
    const contentType = c.req.header('content-type') || ''
    // ตรวจสอบ Header ก่อน parse JSON
    if (!contentType.includes('application/json')) return c.json({ error: "Content-Type must be application/json" }, 415)

    let body: { text?: unknown, userId?: string }

    // ดักจับกรณี Body ว่างเปล่า หรือส่ง JSON ผิดรูปแบบ (Malformed JSON)
    try {
        body = await c.req.json()
    } catch {
        return c.json({ error: "Invalid JSON body" }, 400)
    }

    // ตรวจสอบว่ามีฟิลด์ text, เป็น string จริง และไม่เป็น string ว่าง
    if (!body || typeof body.text !== 'string' || !body.text.trim()) return c.json({ error: "text is required and must be a non-empty string" }, 400)

    // ตรวจสอบความยาวสูงสุดของข้อความ (Max Length)
    if (body.text.length > MAX_TEXT_LENGTH) {
        return c.json({
            error: `text is too long (maximum ${MAX_TEXT_LENGTH} characters)`
        }, 400)
    }

    const userId = body.userId?.trim() || c.req.header('x-user-id') || 'default-user'

    // แปลงข้อความด้วย Parser เดิม
    const defaultTransactions = parseTransactions(body.text)

    // ตรวจสอบ Memory ของ User คนนี้สำหรับแต่ละรายการ
    const transactions = await Promise.all(
        defaultTransactions.map(async (t) => {
            const memoryMatch = await getMemoryMatch(userId, t.description)
            // ถ้าเจอใน Memory -> Override หมวดหมู่เดิมทันที
            if (memoryMatch) {
                return {
                    ...t,
                    category: {
                        id: memoryMatch.categoryId,
                        title: memoryMatch.categoryTitle,
                    },
                    confidence: memoryMatch.confidence, // คะแนนสูง (0.85 - 0.95)
                    source: 'memory' as const,
                }
            }
            // ถ้าไม่เจอใน Memory -> ใช้ของ Default Parser
            return {
                ...t,
                source: 'parser' as const,
            }
        }),
    )
    return c.json({
        userId,
        memoryEnabled: await isMemoryEnabled(userId),
        transactions,
    })
})

/**
 * POST /api/confirm (Passive Learning)
 * กดยืนยันบันทึกรายการลง DB เพื่อให้ระบบเรียนรู้
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
    const userId = body.userId?.trim() || c.req.header('x-user-id') || 'default-user'
    const items = body.transactions
    if (!Array.isArray(items) || items.length === 0) {
        return c.json({ error: 'transactions must be a non-empty array' }, 400)
    }
    // Validate ข้อมูล
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
    // สั่งบันทึกลง MongoDB
    await learnTransactions(userId, validItems)
    return c.json({
        success: true,
        message: `Successfully confirmed and learned ${validItems.length} transactions`,
        count: validItems.length,
    })
})

/**
 * /api/settings/memory
 * สลับการตั้งค่า เปิด/ปิด การจัดหมวดด้วยความจำ
 */
apiRouter.post('/settings/memory', async (c) => {
    let body: { userId?: string; enabled?: boolean }
    try {
        body = await c.req.json()
    } catch {
        return c.json({ error: 'Invalid JSON body' }, 400)
    }
    const userId = body.userId?.trim() || c.req.header('x-user-id') || 'default-user'
    if (typeof body.enabled !== 'boolean') {
        return c.json({ error: 'enabled must be a boolean (true or false)' }, 400)
    }
    await setMemoryEnabled(userId, body.enabled)
    return c.json({
        success: true,
        userId,
        memoryEnabled: body.enabled,
        message: body.enabled ? 'จัดหมวดด้วยความจำ: เปิดใช้งานแล้ว' : 'จัดหมวดด้วยความจำ: ปิดใช้งานแล้ว',
    })
})
