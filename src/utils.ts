export function transformEchoText(text: string) {
  return text.replace('@channel', '<!channel>')
}
