/**
 * Corpus reads over `sessionQuery`, with an incremental digest cache.
 *
 * The only source of truth for session content is the Session log, so this
 * module never parses files. What it does own is the decision of what to read
 * again:
 *
 *  - a Session that is still live may grow, so it is read on every build;
 *  - a closed Session whose digest is cached at the current DIGEST_VERSION is
 *    reused without touching its log;
 *  - everything else is read once, digested, and stored for the next build.
 *
 * `refresh` skips the cache entirely, which is what the panel's Refresh button
 * means. The report cache on top absorbs repeated opens inside one page.
 */

import {
  DIGEST_VERSION,
  analyzeDigests,
  describeSession,
  digestSession,
  hydrateDigest,
  serializeDigest,
} from '../analysis.js'
import { failure } from './services.js'

const DAY_MS = 86_400_000

function queryService(access) {
  const sessions = access.get('sessionQuery')
  if (!sessions || typeof sessions.listSessions !== 'function' || typeof sessions.readSession !== 'function') {
    throw failure(
      'SESSION_QUERY_UNAVAILABLE',
      'This profile has no sessionQuery service, so Session logs cannot be listed or read.',
      'check_profile',
    )
  }
  return sessions
}

async function mapPool(items, limit, worker, stop) {
  const results = new Array(items.length).fill(undefined)
  let cursor = 0
  const width = Math.max(1, Math.min(limit, items.length))
  await Promise.all(
    Array.from({ length: width }, async () => {
      for (;;) {
        const index = cursor
        cursor += 1
        if (index >= items.length) return
        if (stop()) return
        results[index] = await worker(items[index], index)
      }
    }),
  )
  return results
}

export function createCorpus(access, config, store) {
  const cache = new Map()
  const pending = new Map()

  function cached(key, loader) {
    const now = Date.now()
    const hit = cache.get(key)
    if (hit && now - hit.at < config.cacheMs) return Promise.resolve(hit.value)
    const running = pending.get(key)
    if (running) return running
    const promise = loader()
      .then((value) => {
        cache.set(key, { at: Date.now(), value })
        return value
      })
      .finally(() => {
        pending.delete(key)
      })
    pending.set(key, promise)
    return promise
  }

  /** Read every Session created inside the window and fold it into one report. */
  async function report(options = {}) {
    const days = Number.isFinite(options.days) ? Number(options.days) : config.days
    const locale = options.locale === 'en' ? 'en' : 'zh'
    const key = `report|${days}|${locale}|${config.maxSessions}`
    if (options.refresh === true) cache.delete(key)
    return cached(key, async () => {
      const query = queryService(access)
      const signal = options.signal
      const startedAt = Date.now()
      let records
      try {
        records = await query.listSessions(signal)
      } catch (error) {
        throw failure('SESSION_LIST_FAILED', `Listing Sessions failed: ${error?.message ?? error}`, 'retry')
      }
      const from = Date.now() - days * DAY_MS
      const inRange = records
        .filter((record) => Number(record?.header?.createdAt ?? 0) >= from)
        .sort((a, b) => Number(b.header.createdAt) - Number(a.header.createdAt))
      const picked = inRange.slice(0, config.maxSessions)
      const deadline = startedAt + config.budgetMs
      const useCache = options.refresh !== true
      let timeouts = 0
      let reused = 0
      let read = 0
      const failures = []

      try {
        await store.open()
      } catch {
        /* a cache that cannot open only means every Session is read */
      }

      const results = await mapPool(
        picked,
        config.concurrency,
        async (record) => {
          const id = String(record.header.id)
          if (signal?.aborted) return { error: 'cancelled' }
          // A live Session can still grow; only a closed Session's digest is
          // safe to reuse, and only if it was itself captured after closing.
          if (useCache && record.live !== true) {
            const entry = store.get(id)
            if (entry && entry.digestVersion === DIGEST_VERSION && entry.live === false) {
              const digest = hydrateDigest(entry.digest)
              if (digest) {
                reused += 1
                return { digest }
              }
            }
          }
          try {
            const snapshot = await query.readSession(id)
            const digest = digestSession({
              session: snapshot.session ?? record.header,
              events: snapshot.events,
              inheritedEventCount: snapshot.inheritedEventCount,
            })
            store.set(id, {
              live: record.live === true,
              at: Date.now(),
              digestVersion: DIGEST_VERSION,
              digest: serializeDigest(digest),
            })
            read += 1
            return { digest }
          } catch (error) {
            failures.push({ sessionId: id, message: error?.message ?? String(error) })
            return { error: error?.message ?? String(error) }
          }
        },
        () => {
          if (Date.now() <= deadline) return false
          timeouts += 1
          return true
        },
      )

      if (read > 0) {
        try {
          await store.flush()
        } catch {
          /* the cache is an optimisation; a failed write must not fail the report */
        }
      }

      const digests = results.filter((item) => item && item.digest).map((item) => item.digest)
      if (digests.length === 0) {
        throw failure(
          'SESSION_READ_FAILED',
          failures.length > 0
            ? `Every Session in the window failed to read (${failures[0].message}).`
            : 'Every Session in the window failed to read; the log format may need a migration.',
          'check_profile',
        )
      }

      const value = analyzeDigests(digests, {
        days,
        now: Date.now(),
        locale,
        maxSessions: config.maxSessions,
        warnings: failures.map((item) => ({
          code: 'SESSION_READ_FAILED',
          sessionId: item.sessionId,
          message: String(item.message).slice(0, 200),
        })),
      })
      value.scope = {
        listed: records.length,
        inWindow: inRange.length,
        analyzed: digests.length,
        reused,
        read,
        truncated: Math.max(0, picked.length - results.filter(Boolean).length),
        truncatedOutOfRange: Math.max(0, records.length - inRange.length),
        elapsedMs: Date.now() - startedAt,
        windowDays: days,
        cache: { file: store.path, entries: store.size(), version: DIGEST_VERSION },
        limits: { maxSessions: config.maxSessions, budgetMs: config.budgetMs },
      }
      if (timeouts > 0) {
        value.warnings.push({
          code: 'TIME_BUDGET_EXCEEDED',
          sessionId: '',
          message: `Stopped reading after ${config.budgetMs} ms; the remaining Sessions are read on the next refresh.`,
        })
      }
      return value
    })
  }

  /** Read one Session and return the evidence rows the detail view renders. */
  async function detail(sessionId, options = {}) {
    const query = queryService(access)
    const locale = options.locale === 'en' ? 'en' : 'zh'
    const id = String(sessionId ?? '')
    if (id === '') throw failure('SESSION_ID_REQUIRED', 'A session id is required.', 'pick_session')
    const key = `detail|${id}|${locale}`
    return cached(key, async () => {
      let snapshot
      try {
        snapshot = await query.readSession(id)
      } catch (error) {
        throw failure('SESSION_READ_FAILED', `Reading Session ${id} failed: ${error?.message ?? error}`, 'retry')
      }
      return describeSession(
        {
          session: snapshot.session,
          events: snapshot.events,
          inheritedEventCount: snapshot.inheritedEventCount,
        },
        { locale },
      )
    })
  }

  /** The raw log one model call needs; never cached, so an audit reads a fresh cut. */
  async function snapshot(sessionId) {
    const query = queryService(access)
    const id = String(sessionId ?? '')
    if (id === '') throw failure('SESSION_ID_REQUIRED', 'A session id is required.', 'pick_session')
    try {
      const value = await query.readSession(id)
      return { session: value.session, events: value.events, inheritedEventCount: value.inheritedEventCount }
    } catch (error) {
      throw failure('SESSION_READ_FAILED', `Reading Session ${id} failed: ${error?.message ?? error}`, 'retry')
    }
  }

  function clear() {
    cache.clear()
  }

  return { report, detail, snapshot, clear }
}
