import { randomUUID } from 'crypto'

import { cookies } from 'next/headers'

const COOKIE = 'bt_uid'

// Stable per-browser id used to scope private/shared AI Suite scripts.
// Never overwrites an existing id — only ever creates one if missing.
export async function getOrCreateAnonUserId(): Promise<string> {
    const store = await cookies()
    const existing = store.get(COOKIE)?.value
    if (existing) return existing
    const id = randomUUID()
    store.set(COOKIE, id, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 * 5, path: '/' })
    return id
}
