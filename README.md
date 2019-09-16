# Environment Variables

To run this app, the following must be available:

| Variable | Source | Label |
| ----------- | ----------- | ----------- |
| `SLACK_SIGNING_SECRET` | https://api.slack.com/apps/ALQ72EWK1/general | Signing Secret |
| `SLACK_BOT_TOKEN` | https://api.slack.com/apps/ALQ72EWK1/oauth | Bot User OAuth Access Token |
| `JOAN_CONSUMER_KEY` | Joan portal | Client ID |
| `JOAN_CONSUMER_SECRET` | Joan portal | Secret |

# Local Development

## Start the Node application
`node app.js`

## Start the ngrok tunnel
`ngrok 3000`

## Update Slack API
Point to ngrok endpoint, like `https://5596997e.ngrok.io/slack/events`
- Interactive Endpoints
- Slash Commands
- Event Subscriptions
