import { Hono } from 'hono'
import { parseTransactions } from '../modules/parser/transaction'
import { rateLimiter } from '../middlewares/rate-limit'

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

    let body: { text?: unknown }

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

    const transactions = parseTransactions(body.text)
    return c.json({ transactions })
})