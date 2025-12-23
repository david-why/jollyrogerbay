import { App, type SlashCommand } from '@slack/bolt'
import type {
  AppMentionEvent,
  Block,
  FunctionExecutedEvent,
  MemberJoinedChannelEvent,
  MemberLeftChannelEvent,
  SlackEvent,
} from '@slack/web-api'
import { deleteValue, getValue, setValue } from './database/kv'
import { transformEchoText } from './utils'

const {
  SLACK_SIGNING_SECRET,
  SLACK_BOT_TOKEN,
  SLACK_APP_TOKEN,
  SLACK_BOT_USER_ID,
  SLACK_USER_TOKEN,
  SLACK_OWNER,
  SLACK_T1_CHANNEL,
  HACKCLUB_AI_KEY,
  STEAM_API_KEY,
  STEAM_USER_ID,
} = process.env

const app = new App({
  signingSecret: SLACK_SIGNING_SECRET,
  appToken: SLACK_APP_TOKEN,
  token: SLACK_BOT_TOKEN,
  socketMode: true,
})

function getSlack() {
  return app.client
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

async function watchCommand(event: AppMentionEvent, text: string) {
  await app.client.chat.delete({
    channel: event.channel,
    ts: event.ts,
    token: SLACK_USER_TOKEN,
  })
  const args = text.substring(6).trim()
  const userIdMatch = args.match(/<@(U[0-9A-Z]+)>/)
  if (!userIdMatch) {
    await app.client.chat.postEphemeral({
      channel: event.channel,
      user: SLACK_OWNER,
      text: 'no user provided </3',
    })
    return
  }
  const [, userId] = userIdMatch
  const watched =
    (await getValue<Record<string, string>>('watched_users')) || {}
  watched[userId!] = 'new'
  await setValue('watched_users', watched)
  await app.client.chat.postEphemeral({
    channel: event.channel,
    user: SLACK_OWNER,
    text: `started watching <@${userId}>!`,
  })
}

async function unwatchCommand(event: AppMentionEvent, text: string) {
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
    (await getValue<Record<string, string>>('watched_users')) || {}
  if (userId! in watched) {
    delete watched[userId!]
  }
  await setValue('watched_users', watched)
  await slack.chat.postEphemeral({
    channel: event.channel,
    user: SLACK_OWNER,
    text: `stopped watching <@${userId}>!`,
  })
}

async function aiCommand(event: AppMentionEvent, text: string) {
  const slack = getSlack()
  if (!HACKCLUB_AI_KEY) {
    return slack.chat.postEphemeral({
      channel: event.channel,
      thread_ts: event.thread_ts || event.ts,
      user: SLACK_OWNER,
      text: 'No AI API key set.',
    })
  }
  const res = (await fetch(
    'https://ai.hackclub.com/proxy/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HACKCLUB_AI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen/qwen3-32b',
        messages: [{ role: 'user', content: text }],
      }),
    }
  ).then((res) => res.json())) as any
  return slack.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts,
    text: res.choices[0].message.content,
    blocks: [
      {
        type: 'markdown',
        text: res.choices[0].message.content,
      },
    ],
  })
}

// specific handlers

async function onAppMention(event: AppMentionEvent) {
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
    await watchCommand(event, text)
  } else if (text.startsWith('/unwatch')) {
    await unwatchCommand(event, text)
  } else if (text.startsWith('/ai')) {
    await aiCommand(event, text)
  }
}

async function onMemberLeftChannel(event: MemberLeftChannelEvent) {
  if (event.channel !== SLACK_T1_CHANNEL) return
  const slack = getSlack()
  await slack.chat.postMessage({
    channel: SLACK_OWNER,
    text: `hey... <@${event.user}> just left <#${SLACK_T1_CHANNEL}>.`,
  })
}

async function onMemberJoinedChannel(event: MemberJoinedChannelEvent) {
  if (event.channel !== SLACK_T1_CHANNEL) return
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

async function onFunctionExecuted(event: FunctionExecutedEvent) {
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

async function handleCron(cron: string) {
  if (cron === '* * * * *') {
    checkSteamGame()
    checkPresence()
  }
}

async function handleCommand(event: SlashCommand) {
  if (event.command === '/jinfo') {
    let match: RegExpMatchArray | null = null
    if ((match = event.text.match(/<@(U[A-Z0-9]+)\|(.*)>/))) {
      const [, userId, userName] = match
      await fetch(event.response_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: `<@${userId}>\nUser ID: ${userId}\nUser name: ${userName}`,
        }),
      })
    } else if ((match = event.text.match(/<#(C[A-Z0-9]+)\|(.*)>/))) {
      const [, channelId, channelName] = match
      await fetch(event.response_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: `<#${channelId}>\nChannel ID: ${channelId}\nChannel name: ${channelName}`,
        }),
      })
    }
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

async function checkSteamGame() {
  const res = (await fetch(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${STEAM_USER_ID}`
  ).then((r) => r.json())) as any
  const player = res?.response?.players?.[0]
  if (!player) {
    throw new Error(`Failed to get Steam player: ${JSON.stringify(res)}`)
  }
  const prevGameId = await getValue('prev-game-id')
  const gameid = player.gameid || null
  if (prevGameId !== gameid) {
    const slack = getSlack()
    let text = ''
    if (gameid) {
      const gameName = player.gameextrainfo || 'Unknown game'
      text = `<@${SLACK_OWNER}> is now playing: <https://store.steampowered.com/app/${gameid}/|${gameName}>!`
    } else {
      text = `<@${SLACK_OWNER}> stopped playing games!`
    }
    await slack.chat.postMessage({
      channel: SLACK_T1_CHANNEL,
      text,
    })
    if (gameid) {
      await setValue('prev-game-id', gameid)
    } else {
      await deleteValue('prev-game-id')
    }
  }
}

async function checkPresence() {
  const watched = await getValue<Record<string, string>>('watched_users')
  if (!watched) return
  const changed = (
    await Promise.all(
      Object.entries(watched).map((v) => checkPresenceSingle(v, watched))
    )
  ).reduce((a, b) => a || b, false)
  if (changed) {
    await setValue('watched_users', watched)
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

// slack listeners

setInterval(() => {
  checkSteamGame()
  checkPresence()
}, 60_000)

app.event('app_mention', async ({ payload }) => {
  await onAppMention(payload)
})

app.event('member_left_channel', async ({ payload }) => {
  await onMemberLeftChannel(payload)
})

app.event('member_joined_channel', async ({ payload }) => {
  await onMemberJoinedChannel(payload)
})

app.event('function_executed', async ({ payload }) => {
  await onFunctionExecuted(payload)
})

app.command('/jinfo', async ({ ack, payload }) => {
  let match: RegExpMatchArray | null = null
  if ((match = payload.text.match(/<@(U[A-Z0-9]+)\|(.*)>/))) {
    const [, userId, userName] = match
    await ack(`<@${userId}>\nUser ID: ${userId}\nUser name: ${userName}`)
  } else if ((match = payload.text.match(/<#(C[A-Z0-9]+)\|(.*)>/))) {
    const [, channelId, channelName] = match
    await ack(
      `<#${channelId}>\nChannel ID: ${channelId}\nChannel name: ${channelName}`
    )
  }
})

await app.start()
console.log('jollyrogerbay started')
