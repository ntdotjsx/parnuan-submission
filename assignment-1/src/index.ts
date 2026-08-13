import { Hono } from 'hono'
import { extractDate } from './parser/date'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.post('/parse', async (c) => {
  /**
   * Extracts a date and optional time reference from Thai text.
   *
   * Supported patterns:
   * - เมื่อวาน
   * - เมื่อวานตอน 5 โมง
   * - เมื่อวานตอน 5 โมงครึ่ง
   *
   * Returns the resolved date and the input text with the
   * recognized date/time expression removed.
   */
  const body = await c.req.json<{ text: string }>()
  const result = extractDate(body.text)
  /**
   * {
   *    "originalText": "เมื่อวานตอน 5 โมงครึ่ง ข้าวมันไก่ 50",
   *    "date": "2026-08-12T10:30:00.000Z",
   *    "cleanedText": "ข้าวมันไก่ 50"
   * }
   */
  return c.json({
    originalText: body.text,
    date: result.date.toISOString(),
    cleanedText: result.cleanedText,
  })
})

export default app
