import { App } from "@slack/bolt"

const { SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, SLACK_APP_TOKEN } = process.env

const app = new App({
  signingSecret: SLACK_SIGNING_SECRET,
  appToken: SLACK_APP_TOKEN,
  token: SLACK_BOT_TOKEN,
  socketMode: true,
})

export default app
