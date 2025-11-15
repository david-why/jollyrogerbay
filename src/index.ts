import type {
  AppMentionEvent,
  Block,
  FunctionExecutedEvent,
  MemberJoinedChannelEvent,
  MemberLeftChannelEvent,
  SlackEvent,
} from '@slack/web-api'
import { WebClient } from '@slack/web-api'
import { Hono, type Context } from 'hono'
import { transformEchoText } from './utils'

const {
  SLACK_BOT_TOKEN,
  SLACK_BOT_USER_ID,
  SLACK_USER_TOKEN,
  SLACK_OWNER,
  SLACK_CHANNEL,
} = process.env

interface HonoEnv {
  Bindings: Env
}

function getSlack() {
  return new WebClient(SLACK_BOT_TOKEN)
}

// "slash commands"

async function delCommand(event: AppMentionEvent) {
  const slack = getSlack()
  if (event.thread_ts) {
    await Promise.all([
      slack.chat.delete({ channel: event.channel, ts: event.thread_ts }),
      slack.chat.delete({
        channel: event.channel,
        ts: event.ts,
        token: SLACK_USER_TOKEN,
      }),
    ])
  } else {
    await slack.chat.postEphemeral({
      channel: event.channel,
      user: event.user!,
      text: 'You can only delete a thread message',
    })
  }
}

async function echoCommand(event: AppMentionEvent, text: string) {
  const slack = getSlack()
  await Promise.all([
    slack.chat.postMessage({
      channel: event.channel,
      thread_ts: event.thread_ts,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: transformEchoText(text.substring(6)) },
        },
      ],
    }),
    slack.chat.delete({
      channel: event.channel,
      ts: event.ts,
      token: SLACK_USER_TOKEN,
    }),
  ])
}

async function channelCommand(event: AppMentionEvent, text: string) {
  await broadcastMessage(event, text, 'channel')
}

async function hereCommand(event: AppMentionEvent, text: string) {
  await broadcastMessage(event, text, 'here')
}

async function watchCommand(
  event: AppMentionEvent,
  text: string,
  c: Context<HonoEnv>
) {
  const slack = getSlack()
  await slack.chat.delete({
    channel: event.channel,
    ts: event.ts,
    token: SLACK_USER_TOKEN,
  })
  const args = text.substring(6).trim()
  const userIdMatch = args.match(/<@(U[0-9A-Z]+)>/)
  if (!userIdMatch) {
    await slack.chat.postEphemeral({
      channel: event.channel,
      user: SLACK_OWNER,
      text: 'no user provided </3',
    })
    return
  }
  const [, userId] = userIdMatch
  const watched =
    (await c.env.KV.get<Record<string, string>>('watched_users', 'json')) || {}
  watched[userId!] = 'new'
  await c.env.KV.put('watched_users', JSON.stringify(watched))
  await slack.chat.postEphemeral({
    channel: event.channel,
    user: SLACK_OWNER,
    text: `started watching <@${userId}>!`
  })
}

// specific handlers

async function onAppMention(c: Context<HonoEnv>, event: AppMentionEvent) {
  if (!event.text) return
  if (event.user !== SLACK_OWNER) return
  const text = event.text.replace(`<@${SLACK_BOT_USER_ID}>`, '').trim()
  console.log(text)
  if (text === '/del') {
    await delCommand(event)
  } else if (text.startsWith('/echo')) {
    await echoCommand(event, text)
  } else if (text.startsWith('/channel')) {
    await channelCommand(event, text)
  } else if (text.startsWith('/here')) {
    await hereCommand(event, text)
  } else if (text.startsWith('/watch')) {
    await watchCommand(event, text, c)
  }
}

async function onMemberLeftChannel(
  c: Context<HonoEnv>,
  event: MemberLeftChannelEvent
) {
  if (event.channel !== SLACK_CHANNEL) return
  const slack = getSlack()
  await slack.chat.postMessage({
    channel: SLACK_OWNER,
    text: `hey... <@${event.user}> just left <#${SLACK_CHANNEL}>.`,
  })
}

async function onMemberJoinedChannel(
  c: Context<HonoEnv>,
  event: MemberJoinedChannelEvent
) {
  if (event.channel !== SLACK_CHANNEL) return
  const slack = getSlack()
  await slack.chat.postMessage({
    channel: event.channel,
    text: `hey there <@${event.user}> welcome to my ~shithole~ channel! i yap a bit in here at random intervals.\n\n<@${SLACK_OWNER}> come out and greet them!!!`,
  })
}

async function testStep(event: FunctionExecutedEvent) {
  const slack = getSlack()
  const num = event.inputs['num'] as number
  await slack.functions.completeSuccess({
    function_execution_id: event.function_execution_id,
    outputs: { outnum: num + 10000 },
  })
}

async function userChannelPingStep(event: FunctionExecutedEvent) {
  const channel = event.inputs['channel'] as string
  const blocks = event.inputs['content'] as Block[]
  await broadcastMessage({ channel }, '', 'channel', blocks)
  const slack = getSlack()
  await slack.functions.completeSuccess({
    function_execution_id: event.function_execution_id,
    outputs: {},
  })
}

async function userHerePingStep(event: FunctionExecutedEvent) {
  const channel = event.inputs['channel'] as string
  const blocks = event.inputs['content'] as Block[]
  await broadcastMessage({ channel }, '', 'here', blocks)
  const slack = getSlack()
  await slack.functions.completeSuccess({
    function_execution_id: event.function_execution_id,
    outputs: {},
  })
}

// general handlers

async function onFunctionExecuted(
  c: Context<HonoEnv>,
  event: FunctionExecutedEvent
) {
  console.log(JSON.stringify(event, null, 2))
  switch (event.function.callback_id) {
    case 'test-step':
      return await testStep(event)
    case 'user-channel-ping':
      return await userChannelPingStep(event)
    case 'user-here-ping':
      return await userHerePingStep(event)
    default:
      const slack = getSlack()
      return await slack.functions.completeError({
        function_execution_id: event.function_execution_id,
        error: 'i- i dont know how to do that! is the step misconfigured?',
      })
  }
}

async function handleEvent(c: Context<HonoEnv>, event: SlackEvent) {
  if (event.type === 'app_mention') {
    await onAppMention(c, event)
  } else if (event.type === 'member_left_channel') {
    await onMemberLeftChannel(c, event)
  } else if (event.type === 'member_joined_channel') {
    await onMemberJoinedChannel(c, event)
  } else if (event.type === 'function_executed') {
    await onFunctionExecuted(c, event)
  }
}

async function handleCron(cron: string, env: Env, ctx: ExecutionContext) {
  if (cron === '* * * * *') {
    ctx.waitUntil(checkSteamGame(env))
    ctx.waitUntil(checkPresence(env, ctx))
  }
}

// helpers

async function broadcastMessage(
  event: { channel: string; ts?: string; thread_ts?: string },
  text: string,
  type: 'channel' | 'here',
  blocks: Block[] = []
) {
  const slack = getSlack()
  await Promise.all([
    slack.chat.postMessage({
      channel: event.channel,
      thread_ts: event.thread_ts,
      text: `@${type} ${text.substring(type.length + 2)}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<!${type}|> ${text.substring(type.length + 2)}`,
          },
        },
        ...blocks,
      ],
      token: SLACK_USER_TOKEN,
    }),
    event.ts
      ? slack.chat.delete({
          channel: event.channel,
          ts: event.ts,
          token: SLACK_USER_TOKEN,
        })
      : null,
  ])
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
    const slack = getSlack()
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
    if (gameid) {
      await env.KV.put('prev-game-id', gameid)
    } else {
      await env.KV.delete('prev-game-id')
    }
  }
}

async function checkPresence(env: Env, ctx: ExecutionContext) {
  const watched = await env.KV.get<Record<string, string>>(
    'watched_users',
    'json'
  )
  if (!watched) return
  const changed = (
    await Promise.all(
      Object.entries(watched).map((v) => checkPresenceSingle(v, watched))
    )
  ).reduce((a, b) => a || b, false)
  if (changed) {
    await env.KV.put('watched_users', JSON.stringify(watched))
  }
}

async function checkPresenceSingle(
  [userId, lastStatus]: [string, string],
  watched: Record<string, string>
) {
  const slack = getSlack()
  try {
    const presence =
      (await slack.users.getPresence({ user: userId })).presence || 'unknown'
    if (presence !== lastStatus) {
      await slack.chat.postMessage({
        text: `<@${userId}>'s status changed from \`${lastStatus}\` to \`${presence}\``,
        channel: SLACK_OWNER,
      })
      watched[userId] = presence
      return true
    }
  } catch (e) {
    console.error(e)
    await slack.chat.postMessage({
      text: `Failed to update status for <@${userId}>:\n\`\`\`\n${String(
        e
      )}\n\`\`\``,
      channel: SLACK_OWNER,
    })
    return false
  }
  return false
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
