import { ReactionAddRequest } from './schemas/methods'

export class Slack {
  constructor(public token: string) {}

  private async makeAPICall<T extends Slack.Methods.APISuccessResponse>(
    endpoint: string,
    {
      method = 'GET',
      body,
    }: { method?: 'GET'; body?: never } | { method: 'POST'; body?: any } = {}
  ): Promise<T> {
    const res = await fetch(`https://slack.com/api/${endpoint}`, {
      method,
      body: body && JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
    const data = (await res.json()) as Slack.Methods.APIResponse<T>
    if (!data.ok) {
      throw new SlackError(endpoint, data)
    }
    return data
  }

  get reactions() {
    return {
      add: async (params: Slack.Methods.Request.ReactionAdd) => {
        const body = await ReactionAddRequest.decodeAsync(params)
        await this.makeAPICall<Slack.Methods.Response.ReactionAdd>(
          'reactions.add',
          { method: 'POST', body }
        )
      },
    }
  }
}

export class SlackError extends Error {
  constructor(
    public endpoint: string,
    public response: Slack.Methods.APIErrorResponse
  ) {
    super(`Slack ${endpoint} API returned error: ${response.error}`)
  }
}
