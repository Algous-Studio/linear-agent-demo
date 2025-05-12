import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

// Webhook endpoint
app.post('/webhook', async (c) => {
  try {
    // Parse the incoming JSON payload
    const payload = await c.req.json()
    
    // Here you can add your webhook processing logic
    c.text('Received webhook:', payload)
    
    // Return a success response
    return c.json({
      status: 'success',
      message: 'Webhook received successfully'
    }, 200)
  } catch (error) {
    // Handle any errors in processing the webhook
    c.text('Error processing webhook:', error as any)
    return c.json({
      status: 'error',
      message: 'Failed to process webhook'
    }, 400)
  }
})


export default app
