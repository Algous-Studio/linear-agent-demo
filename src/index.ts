import { Hono } from 'hono'
import { LinearClient } from '@linear/sdk'
import OpenAI from 'openai'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs'
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
        const parentCommentId = webhook.notification.parentCommentId 

        // Get all comments in this thread
        const commentsInThread = parentCommentId ? await linearClient.comments({
          filter: {
            parent: {
              id: {
                eq: parentCommentId
              }
            }
          }
        }) : undefined;

        const messages: ChatCompletionMessageParam[] = commentsInThread?.nodes.map((comment) => ({ role: "user", content: comment.body, name: comment.userId || "" })) ?? [{
          role: "user",
          content: webhook.notification.comment.body,
          name: webhook.notification.comment.userId || ""
        }];
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a helpful assistant that can help with issues on Linear. If a question has been asked of you, respond with a helpful answer. If a question has not been asked of you, respond with a summary of the conversation.", name: "assistant" },
            ...messages
          ]
        })

        const responseContent = response.choices[0].message.content;

        const comment = await linearClient.createComment({
          issueId: webhook.notification.issueId,
          body: responseContent,
          parentId: parentCommentId ?? webhook.notification.commentId
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
