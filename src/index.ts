import { Hono, type Context } from 'hono'
import { WebClient } from '@slack/web-api'
import type { AppMentionEvent, SlackEvent } from '@slack/web-api'

interface HonoEnv {
  Bindings: Env
}

function getSlack(env: Env) {
  return new WebClient(env.SLACK_BOT_TOKEN)
}

// specific handlers

async function onAppMention(c: Context<HonoEnv>, event: AppMentionEvent) {
  const slack = getSlack(c.env)
  await slack.reactions.add({
    channel: event.channel,
    name: 'question',
    timestamp: event.ts,
  })
}

async function checkSteamGame(env: Env) {
  const res = (await fetch(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${env.STEAM_API_KEY}&steamids=${env.STEAM_USER_ID}`
  ).then((r) => r.json())) as any
  const player = res?.response?.players?.[0]
  if (!player) {
    throw new Error(`Failed to get Steam player: ${JSON.stringify(res)}`)
  }
  const prevGameId = await env.KV.get('prev-game-id')
  const gameid = player.gameid || null
  if (prevGameId !== gameid) {
    const slack = getSlack(env)
    let text = ''
    if (gameid) {
      const gameName = player.gameextrainfo || 'Unknown game'
      text = `<@${env.SLACK_OWNER}> is now playing: <https://store.steampowered.com/app/${gameid}/|${gameName}>!`
    } else {
      text = `<@${env.SLACK_OWNER}> stopped playing games!`
    }
    await slack.chat.postMessage({
      channel: env.SLACK_CHANNEL,
      text,
    })
    await env.KV.put('prev-game-id', gameid)
  }
}

// general handlers

async function handleEvent(c: Context<HonoEnv>, event: SlackEvent) {
  if (event.type === 'app_mention') {
    await onAppMention(c, event)
  }
}

async function handleCron(cron: string, env: Env, ctx: ExecutionContext) {
  if (cron === '* * * * *') {
    await checkSteamGame(env)
  }
}

// structure

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
    c.executionCtx.waitUntil(handleEvent(c, payload.event))
    return c.body('')
  }
})

app.onError(async (error, c) => {
  if (c.req.path === '/slack/events') {
    return c.text('', 200)
  }
  return c.json({ error: 'internal server error' }, 500)
})

export default {
  ...app,
  async scheduled(controller, env, ctx) {
    await handleCron(controller.cron, env, ctx)
  },
} satisfies ExportedHandler<Env>
