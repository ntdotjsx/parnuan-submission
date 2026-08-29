import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/bun'
import { apiRouter } from './routes/api'
import { uiRouter } from './routes/ui'
import { connectDb } from './modules/db'
import { seedUsersIfEmpty } from './modules/db/seed'

await connectDb().catch((err) => {
  console.error('Failed to connect to MongoDB on startup:', err)
})

await seedUsersIfEmpty().catch(() => {
  console.error('Failed MoxkData')
})

const app = new Hono()

/**
 * Serve static resources (e.g. stylesheets, client scripts, icons)
 * directly from the filesystem using the Bun static runtime adapter.
 */
app.use('/main.css', serveStatic({ path: './static/main.css' }),)

/** เพิ่ม CORS (Cross-Origin Resource Sharing)
 * ไว้ทำไมก็ไม่รู้แต่เพิ่มไว้ก็ดีถึงมันจะไม่จำเป็น เพราะผมทำ SSR
 * แต่เพิ่มไว้ผมว่าน่าจะดีที่สุด
*/
app.use('/api/*', cors())

// ดักจับ Error รวมทั้งระบบ
app.onError((err, c) => {
  console.error('Unhandled Error:', err)
  if (c.req.path.startsWith('/api')) {
    return c.json({ error: 'Internal Server Error' }, 500)
  }
  return c.html('<div class="p-6 text-red-600">เกิดข้อผิดพลาดภายในระบบ</div>', 500)
})
// ดักจับ 404 Not Found
app.notFound((c) => {
  if (c.req.path.startsWith('/api')) {
    return c.json({ error: 'Endpoint Not Found' }, 404)
  }
  return c.html('<div class="p-6 text-slate-600">ไม่พบหน้าที่คุณต้องการ (404)</div>', 404)
})

/**
 * Mount application routers into specific path prefixes:
 * - apiRouter: RESTful API endpoints for external integrations and JSON payloads
 * - uiRouter:  Server-Side Rendered (SSR) pages and HTMX interaction handlers
 */
app.route('/api', apiRouter) // ต้องมีไว้เพื่อให้ผมทดสอบ กับ POSTMAN ได้
app.route('/', uiRouter)

export default app
