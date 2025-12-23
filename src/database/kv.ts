import { sql } from 'bun'

interface Value {
  key: string
  value: string
}

export async function getValue<T>(key: string): Promise<T | null> {
  const result = await sql<Value[]>`SELECT * FROM storage WHERE key = ${key}`
  if (!result.length) return null
  return JSON.parse(result[0]!.value)
}

export async function setValue(key: string, value: any) {
  const payload = { key, value: JSON.stringify(value) }
  await sql`INSERT INTO storage ${sql(
    payload
  )} ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key, value = EXCLUDED.value`
}

export async function deleteValue(key: string) {
  await sql`DELETE FROM storage WHERE key = ${key}`
}
