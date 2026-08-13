import { Hono } from 'hono'
import { extractDate } from './parser/date'
import {
  splitCandidates,
  parseCandidate,
} from './parser/transaction'

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
  // const result = extractDate(body.text)

  // 1: Extract date/time information
  const dateResult = extractDate(body.text)
  /**
   * Splits a message into individual transaction candidates.
   *
   * Supports multiple transactions separated by Thai conjunctions
   * such as "และ" and "แล้วก็".
   */
  // 2: Split the remaining text into transaction candidates
  const candidates = splitCandidates(dateResult.cleanedText)
  /**
   * Parses each transaction candidate into a structured Transaction object.
   *
   * Each candidate is expected to contain a description and an amount.
   * Example: "ข้าวมันไก่ 50" => { description: "ข้าวมันไก่", amount: 50 }
   */
  // 3. Parse each candidate into a transaction
  const transactions = candidates
    .map((candidate) =>
      parseCandidate(candidate, dateResult.date),
    )
    .filter((transaction) => transaction !== null)
  /**
   * Return the parsed date and transaction candidates as JSON.
   * The date is returned in ISO 8601 format.
   * {
   *   "date": "2026-08-12T10:30:00.000Z",
   *   "candidates": [
   *     "ข้าวมันไก่ 50",
   *     "น้ำ Pepsi 15",
   *     "ก็ lm แดง 70"
   *   ]
   * }
   */
  return c.json({
    transactions,
  })
})

export default app
