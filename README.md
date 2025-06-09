# Linear Agent Demo

This is an example framework for getting started building an agent on Cloudflare that can respond to actions inside of Linear.

## Getting started

1. Clone the repo directly & install dependencies: `npm install`

## Production

1. Deploy to Cloudflare `npm run deploy`
1. Create a new [Linear OAuth app](https://linear.app/settings/api/applications/new) (admin role required)
    - For the Authorization callback URL, specify `https://linear-agent-demo.<your-subdomain>.workers.dev/oauth/callback`
    - Enable webhooks and the category `App notifications`
    - Note your Client ID, Client Secret, and Webhook Secret
    - Set secrets via Wrangler

```
wrangler secret put LINEAR_CLIENT_ID
wrangler secret put LINEAR_CLIENT_SECRET
wrangler secret put LINEAR_WEBHOOK_SECRET
wrangler secret put N8N_WEBHOOK_URL
wrangler secret put N8N_WEBHOOK_SECRET
```

The worker forwards gathered conversation context to an n8n workflow instead of
directly calling OpenAI. The workflow's response is posted back to Linear.

4. Set up a KV namespace
    - Create the KV namespace: `wrangler kv:namespace create "LINEAR_TOKENS"`
    - Note the ID
5. Update the `wrangler.jsonc` file with the KV ID, Linear Client ID, and URL
6. Deploy with `npm run deploy`


## Development

Create a `.dev.vars` file in your project root with with the secrets. Note that to receive webhooks from Linear you will need to use a tunnel such as ngrok.

```txt
npm install
npm run dev
```

# Usage
## Endpoints
- `GET /oauth/authorize` triggers the OAuth flow with Linear and generates an `actor=app` token for your app. This token is used to interact with the Linear SDK when responding to OAuth app webhooks.
- `GET /oauth/revoke` revokes your stored OAuth token
- `POST /webhook` is the endpoint at which your OAuth app will receive webhooks from Linear.

## Suggested flow
- Visit https://linear-agent-demo.<your-subdomain>.workers.dev/oauth/authorize in a browser to go through the OAuth flow
- Once you've successfully completed OAuth, your app will begin receiving the webhooks it requested in Linear
- We've included a few simple interactions involving an agent in response to specific mention and assignment notification webhooks to get you started
