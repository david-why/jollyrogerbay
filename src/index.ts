import type {
  AppMentionEvent,
  KnownBlock,
  MemberJoinedChannelEvent,
  MemberLeftChannelEvent,
} from '@slack/web-api'
import app from './client'
import { deleteValue, getValue, setValue } from './database/kv'
import {
  aiCommand,
  channelCommand,
  delCommand,
  echoCommand,
  hereCommand,
  unwatchCommand,
  watchCommand,
} from './handlers/textcmds'
import { addMessageToCache, getCachedMessages } from './cache'
import { replaceInBlocks } from './utils/blocks'
import handlers from './handlers/text'

const {
  SLACK_BOT_USER_ID,
  SLACK_OWNER,
  SLACK_T1_CHANNEL,
  STEAM_API_KEY,
  STEAM_USER_ID,
  SLACK_USER_TOKEN,
} = process.env

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
  } else if (text.startsWith('/test')) {
    await app.client.chat.postEphemeral({
      channel: event.channel,
      user: SLACK_OWNER,
      blocks: [
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'click to ping' },
              action_id: 'test_ping',
            },
          ],
        },
      ],
    })
  }
}

async function onMemberLeftChannel(event: MemberLeftChannelEvent) {
  if (event.channel !== SLACK_T1_CHANNEL) return
  await app.client.chat.postMessage({
    channel: SLACK_OWNER,
    text: `hey... <@${event.user}> just left <#${SLACK_T1_CHANNEL}>.`,
  })
}

async function onMemberJoinedChannel(event: MemberJoinedChannelEvent) {
  if (event.channel !== SLACK_T1_CHANNEL) return
  await app.client.chat.postMessage({
    channel: event.channel,
    text: `hey there <@${event.user}> welcome to my ~shithole~ channel! i yap a bit in here at random intervals.\n\n<@${SLACK_OWNER}> come out and greet them!!!`,
  })
}

// helpers

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
    let text = ''
    if (gameid) {
      const gameName = player.gameextrainfo || 'Unknown game'
      text = `<@${SLACK_OWNER}> is now playing: <https://store.steampowered.com/app/${gameid}/|${gameName}>!`
    } else {
      text = `<@${SLACK_OWNER}> stopped playing games!`
    }
    await app.client.chat.postMessage({
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
  try {
    const presence =
      (await app.client.users.getPresence({ user: userId })).presence ||
      'unknown'
    if (presence !== lastStatus) {
      await app.client.chat.postMessage({
        text: `<@${userId}>'s status changed from \`${lastStatus}\` to \`${presence}\``,
        channel: SLACK_OWNER,
      })
      watched[userId] = presence
      return true
    }
  } catch (e) {
    console.error(e)
    await app.client.chat.postMessage({
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

app.action('test_ping', async ({ ack, body, payload }) => {
  if (body.type !== 'block_actions') return
  if (payload.type !== 'button') return
  await ack()
  const res = await fetch(body.response_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: '@channel',
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '<!channel>' },
        },
      ] satisfies KnownBlock[],
      replace_original: false,
      response_type: 'in_channel',
    }),
  })
  console.log(res.status)
  console.log(await res.text())
})

app.message(async ({ payload }) => {
  if (payload.subtype === 'message_deleted') {
    console.log('message deleted')
    console.log(JSON.stringify(payload.previous_message, null, 2))
  }

  for (const handler of handlers) {
    const res = await handler(payload)
    if (res) break
  }
})

await app.start()
console.log('jollyrogerbay started')
