/**
 * ที่ผมเริ่มทำ security เรื่อง ratelimit เพราะผมเริ่มอินกับโจทย์ละ
 * ตอนนี้ผมไม่ได้มองมันเป็นแค่ โจทย์ เล็กๆธรรมดาผมรู้สึกว่าผม กำลังทำ Production จริงๆ
 * และผมไม่อยากทำให้งานมันออกมา ลวกๆ หรือ แค่ทำพอส่งๆ
 */
import type { Context, Next } from 'hono'

interface RateLimitOptions {
    windowMs: number // ช่วงเวลา (มิลลิวินาที) เช่น 60,000 = 1 นาที
    max: number      // จำนวนครั้งสูงสุดที่ยอมรับได้ในช่วงเวลานั้น
}

export function rateLimiter(options: RateLimitOptions = { windowMs: 60_000, max: 60 }) {
    // เก็บประวัติการยิงของแต่ละ IP ใน RAM
    const ipHits = new Map<string, { count: number; resetTime: number }>()

    // ล้างข้อมูล IP ที่หมดอายุอัตโนมัติทุก 5 นาที เพื่อไม่ให้ RAM บวม
    setInterval(() => {
        const now = Date.now()
        for (const [ip, record] of ipHits.entries()) {
            if (now > record.resetTime) {
                ipHits.delete(ip)
            }
        }
    }, 5 * 60_000)

    return async (c: Context, next: Next) => {
        // ดึง IP Address ของผู้เรียก
        const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'unknown-client'
        const now = Date.now()
        const record = ipHits.get(ip)

        // ถ้ายังไม่เคยยิงมา หรือช่วงเวลาเดิมหมดอายุแล้ว จะ เริ่มนับ 1 ใหม่
        if (!record || now > record.resetTime) {
            ipHits.set(ip, { count: 1, resetTime: now + options.windowMs })
            return next()
        }

        // ถ้าเกินโควตาที่กำหนด จะ ตัดบทด้วย 429 Too Many Requests ทันที
        if (record.count >= options.max) {
            const retryAfterSec = Math.ceil((record.resetTime - now) / 1000)
            c.header('Retry-After', String(retryAfterSec))
            return c.json({
                error: 'Too Many Requests',
                message: `คุณส่งคำขอบ่อยเกินไป กรุณารออีก ${retryAfterSec} วินาที`,
            }, 429)
        }

        // ถ้ายังไม่เกินโควตา จะ เพิ่มจำนวนนับแล้วปล่อยผ่าน
        record.count++
        return next()
    }
}