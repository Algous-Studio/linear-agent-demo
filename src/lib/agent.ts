import { LinearClient, User } from "@linear/sdk";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions/completions.mjs";
import { NotificationComment, NotificationIssue } from "../types/webhooks";

export class Agent {
    private openai: OpenAI;
    private linear: LinearClient;
    private me?: User;

    constructor(openAiApiKey: string, linearAccessToken: string) {
        this.openai = new OpenAI({
            apiKey: openAiApiKey,
        });
        this.linear = new LinearClient({
            accessToken: linearAccessToken,
        });
    }

    async handleComment(inputComment: NotificationComment, parentCommentId?: string): Promise<void> {
        // Get all comments in this thread to provide context if available
        const commentsInThread = parentCommentId ? await this.linear.comments({
            filter: {
                parent: {
                    id: {
                        eq: parentCommentId
                    }
                }
            }
        }) : undefined;
        const me = await this.getMe();

        const messages: ChatCompletionMessageParam[] = commentsInThread?.nodes.map((comment) => ({ role: comment.userId === me.id ? "assistant" : "user", content: comment.body.replace(`@${me.name}`, '').replace(`@${me.displayName}`, '') })) ?? [{
            role: inputComment.userId === me.id ? "assistant" : "user",
            content: inputComment.body,
        }];

        const responseContent = await this.getChatCompletion(messages);

        await this.linear.createComment({
            issueId: inputComment.issueId,
            body: responseContent,
            parentId: parentCommentId ?? inputComment.id
        })
    }

    async handleIssueAssignedToYou(inputIssue: NotificationIssue): Promise<void> {
        const issue = await this.linear.issue(inputIssue.id);
        const me = await this.getMe();
        const description = issue.description;

        let commentBody;
        if (description) {
            const messages: ChatCompletionMessageParam[] = [{
                role: "user",
                content: description.replace(`@${me.name}`, '').replace(`@${me.displayName}`, '')
            }];

            commentBody = await this.getChatCompletion(messages);
        } else {
            commentBody = "How can I help you with this issue? Please tag me in a reply with your question.";
        }

        await this.linear.createComment({
            issueId: issue.id,
            body: commentBody,
        });
    }

    private async getMe(): Promise<User> {
        if (!this.me) {
            this.me = await this.linear.viewer;
        }

        return this.me;
    }

    private async getChatCompletion(messages: ChatCompletionMessageParam[]): Promise<string | null> {
        const prompt = `
            You are a helpful assistant that can help with issues on Linear. 
            If a question has been asked of you, respond with a helpful answer. 
            If a question has not been asked of you, respond with a summary of the conversation.
            
            ## Tone of voice
            
            - Use concise language without any preamble or introduction
            - Avoid including your own thoughts or analysis unless the user explicitly asks for it
            - Use a clear and direct tone (no corpospeak, no flowery wording)
            - Use the first person to keep the conversation personal
            - Answer like a human, not like a search engine
            - Don't just list data you've found, talk with the user as if you are answering a question in a normal conversation
            `;

        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "developer", content: prompt },
                ...messages
            ]
        });

        return response.choices[0].message.content;
    }
}