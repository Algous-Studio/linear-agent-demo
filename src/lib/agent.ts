import { LinearClient, User } from "@linear/sdk";
import { NotificationComment, NotificationIssue, NotificationType } from "../types/webhooks";

interface ChatMessage { role: "user" | "assistant"; content: string }

export class Agent {
    private linear: LinearClient;
    private me?: User;
    private n8nUrl: string;
    private n8nSecret: string;

    constructor(n8nUrl: string, n8nSecret: string, linearAccessToken: string) {
        this.n8nUrl = n8nUrl;
        this.n8nSecret = n8nSecret;
        this.linear = new LinearClient({ accessToken: linearAccessToken });
    }

    async handleComment(inputComment: NotificationComment, notificationType: NotificationType, parentCommentId?: string): Promise<void> {
        const commentsInThread = parentCommentId ? await this.linear.comments({
            filter: { parent: { id: { eq: parentCommentId } } }
        }) : undefined;
        const me = await this.getMe();
        if (notificationType === NotificationType.issueNewComment && !commentsInThread?.nodes.some(c => c.userId === me.id)) {
            return;
        }

        const messages: ChatMessage[] = commentsInThread?.nodes.map(comment => ({
            role: comment.userId === me.id ? "assistant" : "user",
            content: comment.body.replace(`@${me.name}`, '').replace(`@${me.displayName}`, '')
        })) ?? [{
            role: inputComment.userId === me.id ? "assistant" : "user",
            content: inputComment.body,
        }];

        const responseContent = await this.getReplyFromN8n(messages);

        await this.linear.createComment({
            issueId: inputComment.issueId,
            body: responseContent ?? '',
            parentId: parentCommentId ?? inputComment.id,
        });
    }

    async handleIssueAssignedToYou(inputIssue: NotificationIssue): Promise<void> {
        const issue = await this.linear.issue(inputIssue.id);
        const me = await this.getMe();
        const description = issue.description;

        let commentBody: string | null;
        if (description) {
            const messages: ChatMessage[] = [{
                role: "user",
                content: description.replace(`@${me.name}`, '').replace(`@${me.displayName}`, '')
            }];
            commentBody = await this.getReplyFromN8n(messages);
        } else {
            commentBody = "How can I help you with this issue? Please tag me in a reply with your question.";
        }

        await this.linear.createComment({
            issueId: issue.id,
            body: commentBody ?? '',
        });
    }

    private async getMe(): Promise<User> {
        if (!this.me) {
            this.me = await this.linear.viewer;
        }
        return this.me;
    }

    private async getReplyFromN8n(messages: ChatMessage[]): Promise<string | null> {
        const res = await fetch(this.n8nUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.n8nSecret}`
            },
            body: JSON.stringify({ messages })
        });
        if (!res.ok) {
            throw new Error(`n8n request failed: ${res.statusText}`);
        }
        const data = await res.json() as { reply?: string };
        return data.reply ?? null;
    }
}
