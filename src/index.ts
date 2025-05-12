import { Hono } from 'hono'
import { AgentNotificationWebhookSchema } from './schema'
import { LinearClient } from '@linear/sdk'
const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

// Webhook endpoint
app.post('/webhook', async (c) => {
  try {
    // Parse the incoming JSON payload
    const payload = await c.req.text();
    const webhook = JSON.parse(payload);
    console.log(webhook)

    const linearClient = new LinearClient({
      apiKey: process.env.LINEAR_OAUTH_TOKEN
    })

    // const me = await linearClient.viewer;

    if(webhook.type === 'AppUserNotification') {
      if(webhook.notification.type === "issueAssignedToYou") {
        const issue = await linearClient.issue(webhook.notification.issueId)
        
        const comment = await linearClient.createComment({
          issueId: webhook.notification.issueId,
          body: `Hey! I'll be helping you out with this issue.`,
        })

        console.log(comment)
      }
      if(webhook.notification.type === "issueCommentMention") {
        const comment = await linearClient.createComment({
          issueId: webhook.notification.issueId,
          body: `Hey! Thanks for tagging me. I'll be helping you out with this issue.`,
          parentId: webhook.notification.commentId
        })
        console.log(comment)
      }
    }
    
    // Return a success response
    return c.json({
      status: 'success',
      message: 'Webhook received successfully'
    }, 200)
  } catch (error) {
    // Handle any errors in processing the webhook
    console.error(error)
    c.text('Error processing webhook:', error as any)
    return c.json({
      status: 'error',
      message: 'Failed to process webhook'
    }, 400)
  }
})


export default app
