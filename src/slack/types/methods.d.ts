namespace Slack.Methods {
  interface APIErrorResponse {
    ok: false
    error: string
  }
  interface APISuccessResponse {
    ok: true
  }
  type APIResponse<T extends APISuccessResponse> = APIErrorResponse | T
}
