import { Hono } from 'hono'
import { oauth } from './routes/oauth'
import { webhook } from './routes/webhook'

interface CloudflareBindings {
  LINEAR_TOKENS: KVNamespace;
  LINEAR_CLIENT_ID: string;
  LINEAR_CLIENT_SECRET: string;
  URL: string;
  LINEAR_WEBHOOK_SECRET: string;
  N8N_WEBHOOK_URL: string;
  N8N_WEBHOOK_SECRET: string;
}

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.get('/', (c) => {
  return c.text('Hello!')
})

app.route('/webhook', webhook)
app.route('/oauth', oauth)

export default app
