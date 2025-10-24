import z from 'zod'

export const ReactionAddRequest = z.object({
  channel: z.string(),
  name: z.string(),
  timestamp: z.string(),
})

export const ReactionAddResponse = z.object({
  ok: z.literal(true),
})

declare global {
  namespace Slack.Methods {
    namespace Request {
      type ReactionAdd = z.infer<typeof ReactionAddRequest>
    }
    namespace Response {
      type ReactionAdd = z.infer<typeof ReactionAddResponse>
    }
  }
}
