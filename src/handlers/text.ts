import type { KnownBlock, MessageEvent } from '@slack/types'
import type { UsersInfoResponse } from '@slack/web-api'
import {
  addMessageToCache,
  deleteMessageFromCache,
  getCachedMessages,
} from '../cache'
import app from '../client'
import { replaceInBlocks } from '../utils/blocks'
import { DateTime } from 'luxon'

const { SLACK_OWNER, SLACK_USER_TOKEN } = process.env

async function maybeCacheMessage(payload: MessageEvent) {
  if (
    (!payload.subtype || payload.subtype === 'file_share') &&
    payload.user === SLACK_OWNER
  ) {
    addMessageToCache(payload)
  }

  if (
    payload.subtype === 'message_deleted' &&
    (!payload.previous_message.subtype ||
      payload.previous_message.subtype === 'file_share') &&
    payload.previous_message.user === SLACK_OWNER
  ) {
    deleteMessageFromCache(payload.channel, payload.previous_message.ts)
  }
}

async function replaceText(payload: MessageEvent) {
  if (payload.subtype || payload.user !== SLACK_OWNER) return

  const match = payload.text?.match(/^s\/([^/]+?)\/([^/]*?)$/)
  if (!match) return

  app.client.chat.delete({
    token: SLACK_USER_TOKEN,
    channel: payload.channel,
    ts: payload.ts,
  })

  const find = match[1]!
  const replace = match[2]!
  const thread_ts: string | undefined = (payload as any).thread_ts

  const message = getCachedMessages(payload.channel, thread_ts).find(
    (e) => !e.subtype || e.subtype === 'file_share'
  )
  if (!message) {
    await app.client.chat.postEphemeral({
      token: SLACK_USER_TOKEN,
      channel: payload.channel,
      thread_ts,
      user: SLACK_OWNER,
      text: "i didn't find any cached messages by you in this thread :c",
    })
  } else {
    const blocks = message.blocks
    if (blocks) {
      replaceInBlocks(blocks as KnownBlock[], find, replace)
    }
    const text = message.text?.replaceAll(find, replace)
    await app.client.chat.update({
      token: SLACK_USER_TOKEN,
      channel: message.channel,
      ts: message.ts,
      text,
      blocks: blocks || [],
    })
  }

  return true
}

async function sendTemplateMessage(payload: MessageEvent) {
  if (payload.subtype !== 'me_message' || payload.user !== SLACK_OWNER) return

  app.client.chat.delete({
    token: SLACK_USER_TOKEN,
    channel: payload.channel,
    ts: payload.ts,
  })

  const text = payload.text
  let newText = text

  let userInfo: UsersInfoResponse | null = null
  const getUserInfo = async () => {
    if (userInfo) return userInfo
    return (userInfo = await app.client.users.info({
      user: SLACK_OWNER,
    }))
  }

  for (const item of text.matchAll(
    /{([^0-9]*?)(?:(?:([0-9]{4})-?)?([0-9]{1,2}?)-?([0-9]{1,2}) )?([0-9]{1,2}?):?([0-9]{1,2})(?::?([0-9]{1,2}))?}/g
  )) {
    //    [, s?, s, s, s, s, s?]
    // or [, u, u, u, s, s, s?]
    const [part, fmt, year, month, day, hour, minute, second] = item
    const tz = (await getUserInfo()).user!.tz

    const instant = DateTime.fromObject(
      {
        year: year ? parseInt(year) : undefined,
        month: month ? parseInt(month) : undefined,
        day: day ? parseInt(day) : undefined,
        hour: hour ? parseInt(hour) : undefined,
        minute: minute ? parseInt(minute) : undefined,
        second: second ? parseInt(second) : undefined,
      },
      { zone: tz }
    )

    const timestamp = Math.floor(instant.toSeconds())
    const format = fmt
      ? { r: '{ago}' }[fmt] || fmt
      : `${day ? '{date_short} at ' : ''}${second ? '{time_secs}' : '{time}'}`
    const fallback = part.substring(1, part.length - 1)

    const replace = `<!date^${timestamp}^${format}|${fallback}>`

    newText = newText.replace(part, replace)
  }

  await app.client.chat.postMessage({
    token: SLACK_USER_TOKEN,
    channel: payload.channel,
    thread_ts: (payload as any).thread_ts,
    text: newText,
  })

  return true
}

const handlers: ((payload: MessageEvent) => Promise<boolean | void>)[] = [
  sendTemplateMessage,
  replaceText,
  // cache should probably be at the end
  maybeCacheMessage,
]

export default handlers
