import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { apiRouter } from './routes/api'
import { uiRouter } from './routes/ui'

const app = new Hono()

/**
 * Serve static resources (e.g. stylesheets, client scripts, icons)
 * directly from the filesystem using the Bun static runtime adapter.
 */
app.use('/main.css', serveStatic({ path: './static/main.css' }),)

/**
 * Mount application routers into specific path prefixes:
 * - apiRouter: RESTful API endpoints for external integrations and JSON payloads
 * - uiRouter:  Server-Side Rendered (SSR) pages and HTMX interaction handlers
 */
app.route('/api', apiRouter)
app.route('/', uiRouter)

export default app
