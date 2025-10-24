import { Hono, type Context } from 'hono'
import { WebClient } from '@slack/web-api';

interface HonoEnv {
  Bindings: Env
}

function getSlack(c: Context<HonoEnv>) {
  return new WebClient(c.env.SLACK_BOT_TOKEN)
}

async function handleEvent(
  c: Context<HonoEnv>,
  request: Slack.Events.EventCallbackRequest
) {
  const slack = getSlack(c)
  const { event } = request
  if (event.type === 'app_mention') {
    await slack.reactions.add({
      channel: event.channel,
      name: 'question',
      timestamp: event.ts,
    })
  }
}

const app = new Hono<HonoEnv>()

app.get('/', async (c) => {
  return c.text('hello world')
})

app.post('/slack/events', async (c) => {
  const payload = (await c.req.json()) as Slack.Events.Request
  if (payload.token !== payload.token) {
    return c.notFound()
  }
  if (payload.type === 'url_verification') {
    return c.text(payload.challenge)
  } else if (payload.type === 'event_callback') {
    c.executionCtx.waitUntil(handleEvent(c, payload))
    return c.body('')
  }
})

app.onError(async (error, c) => {
  if (c.req.path === '/slack/events') {
    return c.text('', 200)
  }
  return c.json({ error: 'internal server error' }, 500)
})

export default app
