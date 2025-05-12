import { Hono } from 'hono'
import { LinearClient } from '@linear/sdk'
import OpenAI from 'openai'
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

    // Initialize the OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    // const me = await linearClient.viewer;

    if(webhook.type === 'AppUserNotification') {
      if(webhook.notification.type === "issueAssignedToYou") {
        const issue = await linearClient.issue(webhook.notification.issueId);
        const issueDescription = issue.description ?? '';
        
        const comment = await linearClient.createComment({
          issueId: webhook.notification.issueId,
          body: `Hey! I'll be helping you out with this issue.`,
        })

        console.log(comment)
      }
      if(webhook.notification.type === "issueCommentMention") {
        const parentCommentId = webhook.notification.parentCommentId ?? webhook.notification.commentId

        // Get all comments in this thread
        const comments = await linearClient.comments({
          filter: {
            parent: {
              id: {
                eq: parentCommentId
              }
            }
          }
        })

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: comments.nodes.map((comment) => ({ role: "user", content: comment.body, name: comment.userId }))
        })

        const responseContent = response.choices[0].message.content;

        const comment = await linearClient.createComment({
          issueId: webhook.notification.issueId,
          body: responseContent,
          parentId: parentCommentId
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
