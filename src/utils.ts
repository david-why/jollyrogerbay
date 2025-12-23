import type { Block } from '@slack/types'
import app from './client'

const { SLACK_USER_TOKEN } = process.env

export function transformEchoText(text: string) {
  return text.replace('@channel', '<!channel>')
}

export async function broadcastMessage(
  event: { channel: string; ts?: string; thread_ts?: string },
  text: string,
  type: 'channel' | 'here',
  blocks: Block[] = []
) {
  await Promise.all([
    app.client.chat.postMessage({
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
      ? app.client.chat.delete({
          channel: event.channel,
          ts: event.ts,
          token: SLACK_USER_TOKEN,
        })
      : null,
  ])
}
