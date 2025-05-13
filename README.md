# Setup and deployment

## Linear
- Create an OAuth app with your CF worker's `/oauth/callback` route configured as the callback URL, and the `/webhook` route configured as the webhook URL

## Cloudflare

Make sure you configure the necessary [environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables/) in each environment.

### Local development
```txt
npm install
npm run dev
```

### CF Worker
```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

# Usage
## Endpoints
- `GET /oauth/authorize` triggers the OAuth flow with Linear and generates an `actor=app` token for your server. This token is used to interact with the Linear SDK when responding to OAuth app webhooks.
- `GET /oauth/revoke` revokes your stored OAuth token
- `POST /webhook` is the endpoint at which your OAuth app will receive webhooks

## Suggested flow
- Visit https://my-domain/oauth/authorize in a browser to go through the OAuth flow
- Once you've successfully completed OAuth, your app will begin receiving the webhooks it requested in Linear
- We've included a few simple interactions involving an agent in response to specific webhooks to get you started
