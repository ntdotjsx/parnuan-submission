import { Hono } from 'hono'
import { parseTransactions } from '../modules/parser/transaction'

export const apiRouter = new Hono()

/**
 * POST /parse
 * Parses a string containing one or more transactions.
 * Each transaction is expected to contain a description and an amount.
 * @param input - A string containing one or more transactions.
 * @returns An array of parsed Transaction objects.
 */
apiRouter.post('/parse', async (c) => {
    const body = await c.req.json<{ text: string }>()
    const transactions = parseTransactions(body.text)
    return c.json({ transactions })
})