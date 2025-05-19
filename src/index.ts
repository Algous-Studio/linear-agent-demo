import { Hono } from 'hono'
import { oauth } from './routes/oauth'
import { webhook } from './routes/webhook'

interface CloudflareBindings {
  LINEAR_TOKENS: KVNamespace;
  OPENAI_API_KEY: string;
  LINEAR_CLIENT_ID: string;
  LINEAR_CLIENT_SECRET: string;
  LINEAR_CALLBACK_URL: string;
  LINEAR_WEBHOOK_SECRET: string;
}

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.get('/', (c) => {
  return c.text('Hello!')
})

app.route('/webhook', webhook)
app.route('/oauth', oauth)

export default app
