import { LinearClient } from "@linear/sdk";
import { createHmac } from "crypto";
import { Hono } from "hono";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

const webhook = new Hono<{ Bindings: CloudflareBindings }>();

webhook.post('/', async (c) => {
    try {
        const payload = await c.req.text();
        const webhook = JSON.parse(payload);

        // Verify signature
        const signature = createHmac("sha256", c.env.LINEAR_WEBHOOK_SECRET).update(payload).digest("hex");
        if (signature !== c.req.header('linear-signature')) {
            return c.json({ error: 'Invalid signature' }, 400)
        }

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

export { webhook };