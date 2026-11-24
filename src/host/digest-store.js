/**
 * Durable per-Session digest cache.
 *
 * Reading a month of Session logs is the expensive part of this plugin; folding
 * digests into a report is cheap. So each Session's digest is stored next to the
 * audits, keyed by Session id, with the two facts that decide whether it may be
 * reused:
 *
 *  - `live`: a Session that is live can still grow, so its digest is never
 *    trusted. Once it is closed the digest is read one final time and then kept.
 *  - `digestVersion`: a scoring change bumps the version, which invalidates
 *    every older record instead of silently reporting stale numbers.
 *
 * Writes are batched: one report build reads 80+ Sessions and must not write
 * 80+ times, so `set` only marks the store dirty and `flush` persists once.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { ensureStateDir, stateDir } from './state-dir.js'

const MAX_ENTRIES = 600

export function createDigestStore() {
  const file = join(stateDir(), 'digests.json')

  let data = null
  let dirty = false
  let queue = Promise.resolve()

  async function load() {
    if (data) return data
    await ensureStateDir()
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'))
      data =
        parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object'
          ? { version: 1, entries: parsed.entries }
          : { version: 1, entries: {} }
    } catch {
      data = { version: 1, entries: {} }
    }
    return data
  }

  async function write() {
    const current = await load()
    if (!dirty) return
    dirty = false
    await ensureStateDir()
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(temporary, JSON.stringify({ version: 1, entries: current.entries }), 'utf8')
    await fs.rename(temporary, file)
  }

  return {
    path: file,
    /** Load once before a report build so get/set can stay synchronous. */
    open: load,
    get(sessionId) {
      if (!data) return null
      return data.entries[String(sessionId)] ?? null
    },
    set(sessionId, record) {
      if (!data) return
      const key = String(sessionId)
      if (key === '') return
      data.entries[key] = record
      dirty = true
      const keys = Object.keys(data.entries)
      if (keys.length > MAX_ENTRIES) {
        keys
          .sort((a, b) => Number(data.entries[a].at ?? 0) - Number(data.entries[b].at ?? 0))
          .slice(0, keys.length - MAX_ENTRIES)
          .forEach((old) => delete data.entries[old])
      }
    },
    flush() {
      queue = queue.then(write, write)
      return queue
    },
    size() {
      return data ? Object.keys(data.entries).length : 0
    },
    async remove(sessionId) {
      if (!data) await load()
      if (data.entries[String(sessionId)] === undefined) return false
      delete data.entries[String(sessionId)]
      dirty = true
      await this.flush()
      return true
    },
  }
}
