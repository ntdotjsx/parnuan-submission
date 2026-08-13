import { Hono } from 'hono'
import { parseTransactions } from './parser/transaction' // import the parseTransactions function from the transaction parser module

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.post('/parse', async (c) => {
  const body = await c.req.json<{ text: string }>()

  const transactions = parseTransactions(body.text)

  return c.json({
    transactions,
  })
})

export default app
