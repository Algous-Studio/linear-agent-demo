import { createHmac } from "crypto";
import { Hono } from "hono";
import { Agent } from "../lib/agent";
import { AgentNotificationWebhook, NotificationType } from "../types/webhooks";

const webhook = new Hono<{ Bindings: CloudflareBindings }>();

webhook.post('/', async (c) => {
    try {
        const payload = await c.req.text();
        const rawWebhook = JSON.parse(payload);

        const signature = createHmac("sha256", c.env.LINEAR_WEBHOOK_SECRET)
            .update(payload)
            .digest("hex");
        if (signature !== c.req.header('linear-signature')) {
            return c.json({ error: 'Invalid signature' }, 400);
        }

        if (rawWebhook.type !== 'AppUserNotification') {
            return c.json({ status: 'success', message: 'Webhook received successfully' }, 200);
        }

        const hook = rawWebhook as AgentNotificationWebhook;
        const linearAccessToken = await c.env.LINEAR_TOKENS.get('access_token');
        if (!linearAccessToken) {
            throw new Error('No access token found. Please complete the OAuth flow first.');
        }

        const agent = new Agent(c.env.N8N_WEBHOOK_URL, c.env.N8N_WEBHOOK_SECRET, linearAccessToken);

        if (hook.notification.type === NotificationType.issueAssignedToYou || hook.notification.type === NotificationType.issueMention) {
            if (!hook.notification.issue) {
                throw new Error('No issue found in webhook');
            }
            await agent.handleIssueAssignedToYou(hook.notification.issue);
        }
        else if (hook.notification.type === NotificationType.issueCommentMention || (hook.notification.type === NotificationType.issueNewComment && hook.notification.parentCommentId)) {
            if (!hook.notification.comment) {
                throw new Error('No comment found in webhook');
            }
            await agent.handleComment(hook.notification.comment, hook.notification.type, hook.notification.parentCommentId);
        }

        return c.json({ status: 'success', message: 'Webhook received successfully' }, 200);
    } catch (e) {
        return c.json({ status: 'error', message: 'Failed to process webhook' }, 400);
    }
});

export { webhook };
