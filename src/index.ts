import { Hono } from 'hono'
import { LinearClient } from '@linear/sdk'
import OpenAI from 'openai'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs'
import { OAuth } from './oauth'

interface CloudflareBindings {
  LINEAR_TOKENS: KVNamespace;
  OPENAI_API_KEY: string;
  LINEAR_CLIENT_ID: string;
  LINEAR_CLIENT_SECRET: string;
  LINEAR_CALLBACK_URL: string;
}

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.get('/', (c) => {
  return c.text('Hello!')
})

// OAuth authorization endpoint
app.get('/oauth/authorize', async (c) => {
  // Generate a new state for this OAuth flow and store it in KV
  const state = OAuth.generateState();
  await c.env.LINEAR_TOKENS.put('oauth_state', state)

  const authUrl = OAuth.generateAuthorizationUrl(c.env.LINEAR_CLIENT_ID, c.env.LINEAR_CALLBACK_URL, state)
  return c.redirect(authUrl)
})

// OAuth callback endpoint
app.get('/oauth/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const error = c.req.query('error')

  if (error) {
    return c.json({ error: 'Authorization failed', details: error }, 400)
  }

  if (!code || !state) {
    return c.json({ error: 'Missing required parameters' }, 400)
  }

  try {
    // Retrieve the stored state from KV
    const storedState = await c.env.LINEAR_TOKENS.get('oauth_state')
    if (!storedState || storedState !== state) {
      return c.json({ error: 'Invalid state parameter' }, 400)
    }

    const tokenResponse = await OAuth.exchangeCodeForToken(code, c.env.LINEAR_CLIENT_ID, c.env.LINEAR_CLIENT_SECRET, c.env.LINEAR_CALLBACK_URL);
    const accessToken = tokenResponse.access_token;

    // Store the access token in KV
    await c.env.LINEAR_TOKENS.put('access_token', accessToken)

    // Clean up the state
    await c.env.LINEAR_TOKENS.delete('oauth_state')

    return c.json({
      status: 'success',
      message: 'OAuth flow completed successfully. The access token has been stored in KV.',
    })
  } catch (error) {
    // Clean up the state if something goes wrong
    await c.env.LINEAR_TOKENS.delete('oauth_state')

    return c.json({
      status: 'error',
      message: 'Failed to complete OAuth flow',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 400)
  }
})

// OAuth revoke endpoint
app.get('/oauth/revoke', async (c) => {
  try {
    // Get the access token from KV
    const accessToken = await c.env.LINEAR_TOKENS.get('access_token')
    if (!accessToken) {
      return c.json({ error: 'No access token found' }, 400)
    }

    // Revoke the token in Linear
    const response = await fetch('https://api.linear.app/oauth/revoke', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to revoke token in Linear: ${response.statusText}`)
    }

    // Delete the token from KV
    await c.env.LINEAR_TOKENS.delete('access_token')

    return c.json({
      status: 'success',
      message: 'Access token has been revoked in Linear and removed from storage.'
    })
  } catch (error) {
    console.error('Error revoking token:', error)
    return c.json({
      status: 'error',
      message: 'Failed to revoke access token',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Webhook endpoint
app.post('/webhook', async (c) => {
  try {
    const payload = await c.req.text();
    const webhook = JSON.parse(payload);

    // eslint-disable-next-line no-console
    console.log('Received webhook', webhook);

    // Get the access token from KV
    const accessToken = await c.env.LINEAR_TOKENS.get('access_token')
    if (!accessToken) {
      throw new Error('No access token found. Please complete the OAuth flow first.')
    }

    const linearClient = new LinearClient({
      apiKey: accessToken
    })
    const me = await linearClient.viewer;

    const openai = new OpenAI({
      apiKey: c.env.OPENAI_API_KEY
    })

    if (webhook.type === 'AppUserNotification') {
      if (webhook.notification.type === "issueAssignedToYou") {
        const issue = await linearClient.issue(webhook.notification.issueId);
        const description = issue.description;

        let commentBody;
        if (description) {
          const messages: ChatCompletionMessageParam[] = [{
            role: "user",
            content: description.replace(`@${me.name}`, '').replace(`@${me.displayName}`, '')
          }];

          commentBody = await getChatCompletion(openai, messages);
        } else {
          commentBody = "How can I help you with this issue? Please tag me in a reply with your question.";
        }

        await linearClient.createComment({
          issueId: webhook.notification.issueId,
          body: commentBody,
        });
      }

      // Handle comments that mention the app user, or that are in threads that the app user is a participant in
      if (webhook.notification.type === "issueCommentMention" || (webhook.notification.type === "issueNewComment" && webhook.notification.parentCommentId)) {
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

        const messages: ChatCompletionMessageParam[] = commentsInThread?.nodes.map((comment) => ({ role: comment.userId === me.id ? "assistant" : "user", content: comment.body.replace(`@${me.name}`, '').replace(`@${me.displayName}`, '') })) ?? [{
          role: webhook.notification.comment.userId === me.id ? "assistant" : "user",
          content: webhook.notification.comment.body,
        }];

        const responseContent = await getChatCompletion(openai, messages);

        await linearClient.createComment({
          issueId: webhook.notification.issueId,
          body: responseContent,
          parentId: parentCommentId ?? webhook.notification.commentId
        })
      }
    }

    // Return a success response
    return c.json({
      status: 'success',
      message: 'Webhook received successfully'
    }, 200)
  } catch (error) {
    // Handle any errors in processing the webhook
    console.error('Error processing webhook:', error)
    return c.json({
      status: 'error',
      message: 'Failed to process webhook'
    }, 400)
  }
})

async function getChatCompletion(openai: OpenAI, messages: ChatCompletionMessageParam[]): Promise<string | null> {
  const prompt = `
  You are a helpful assistant that can help with issues on Linear. If a question has been asked of you, respond with a helpful answer. If a question has not been asked of you, respond with a summary of the conversation.
  
  ## Tone of voice
  
  - Use concise language without any preamble or introduction
  - Avoid including your own thoughts or analysis unless the user explicitly asks for it
  - Use a clear and direct tone (no corpospeak, no flowery wording)
  - Use the first person to keep the conversation personal
  - Answer like a human, not like a search engine
  - Don't just list data you've found, talk with the user as if you are answering a question in a normal conversation
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "developer", content: prompt },
      ...messages
    ]
  });

  return response.choices[0].message.content;
}

export default app
