/**
 * Durable storage for audit results.
 *
 * An audit costs a model request, so its text must survive a panel switch, a
 * page reload and an app restart. The profile has no declared storage domain
 * route this plugin can rely on, so the record lives in this plugin's own state
 * directory, the same place the other installed UI plugin keeps its captures:
 * `$DSH_HOME/<plugin>/audits.json`.
 *
 * Failure policy: a corrupt or unreadable file starts an empty store (the page
 * simply offers a fresh audit); a write failure is reported to the caller so
 * the page can say the result was not saved.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { ensureStateDir, stateDir } from './state-dir.js'

const MAX_ENTRIES = 300
const MAX_TEXT = 80_000

export function createAuditStore() {
  const file = join(stateDir(), 'audits.json')

  let loaded = null
  let queue = Promise.resolve()

  async function load() {
    if (loaded) return loaded
    await ensureStateDir()
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'))
      loaded =
        parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object'
          ? { version: 1, entries: parsed.entries }
          : { version: 1, entries: {} }
    } catch {
      loaded = { version: 1, entries: {} }
    }
    return loaded
  }

  async function flush() {
    const data = await load()
    await ensureStateDir()
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(temporary, JSON.stringify({ version: 1, entries: data.entries }), 'utf8')
    await fs.rename(temporary, file)
  }

  /** Serialize writes: two audits finishing together must not drop one. */
  function persist() {
    queue = queue.then(flush, flush)
    return queue
  }

  return {
    path: file,
    async get(sessionId) {
      const data = await load()
      return data.entries[String(sessionId)] ?? null
    },
    async put(record) {
      const data = await load()
      const key = String(record.sessionId ?? '')
      if (key === '') throw new Error('an audit record needs a session id')
      data.entries[key] = {
        sessionId: key,
        text: String(record.text ?? '').slice(0, MAX_TEXT),
        at: Number(record.at) || Date.now(),
        provider: typeof record.provider === 'string' ? record.provider : '',
        model: typeof record.model === 'string' ? record.model : '',
        modelName: typeof record.modelName === 'string' ? record.modelName : '',
        characters: String(record.text ?? '').length,
        stats: record.stats && typeof record.stats === 'object' ? record.stats : undefined,
      }
      const keys = Object.keys(data.entries)
      if (keys.length > MAX_ENTRIES) {
        keys
          .sort((a, b) => Number(data.entries[a].at ?? 0) - Number(data.entries[b].at ?? 0))
          .slice(0, keys.length - MAX_ENTRIES)
          .forEach((old) => delete data.entries[old])
      }
      await persist()
      return data.entries[key]
    },
    async remove(sessionId) {
      const data = await load()
      if (data.entries[String(sessionId)] === undefined) return false
      delete data.entries[String(sessionId)]
      await persist()
      return true
    },
  }
}
