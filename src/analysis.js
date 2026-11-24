/**
 * Deterministic analysis of a DSH session corpus.
 *
 * The module is pure: it receives already-decoded session logs and returns a
 * compact report. The Host half feeds it from `sessionQuery.readSession`; the
 * probe scripts feed it from raw log files, so tuning and shipping read the
 * same code path.
 *
 * Three questions drive every metric:
 *  - 冗余流程 (redundant flow): work the corpus repeats — the same call with the
 *    same arguments, the same tool sequence, the same request typed again.
 *  - 重复痛点 (repeated pain): the same failure or friction signature showing up
 *    across sessions, not just often in one.
 *  - 失败处置 (how a failure was handled): the museum in `museum.js` reads the
 *    neighbours of every failure to decide retry / adjust / switch / hand back.
 */

import { aggregateMuseum, buildMuseum } from './museum.js'
import { USER_SIGNALS, failureSpecies, painAdvice, painKind, painLabel } from './pain.js'
import { messageText, stableArguments } from './text.js'

const DAY_MS = 86_400_000

const READ_TOOLS = new Set(['read', 'read_image'])
const SAMPLE_LIMIT = 180

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function truncate(text, limit) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`
}

/** The one file path a call targets, when the tool takes one. */
function targetPath(raw) {
  if (typeof raw !== 'string' || raw === '') return null
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const path = value.file_path ?? value.path ?? value.notebook_path
    return typeof path === 'string' && path !== '' ? path : null
  } catch {
    return null
  }
}

/**
 * A tool result counts as a failure only on an authoritative signal: the tool
 * marked it as an error, the event carries an error, or a shell result ends
 * with a non-zero exit marker. Successful output is never keyword-scanned —
 * reading a source file that mentions "timeout" is not a timeout.
 */
function failureOf(message, data, text) {
  const isError = message?.isError === true
  const errorCode = typeof data?.error?.code === 'string' ? data.error.code : ''
  const exitMarker = /\[exit code: ([1-9]\d*)\]\s*$/.exec(text)
  if (!isError && !errorCode && !exitMarker) return null
  return {
    isError,
    errorCode,
    exitCode: exitMarker ? Number(exitMarker[1]) : 0,
  }
}

function emptyDigest(session) {
  return {
    id: String(session?.id ?? ''),
    title: '',
    cwd: session?.cwd ?? null,
    createdAt: Number(session?.createdAt ?? 0),
    lastEventAt: 0,
    turns: 0,
    steps: 0,
    userMessages: 0,
    injectedMessages: 0,
    toolCalls: 0,
    toolFailures: 0,
    abortedTurns: 0,
    redundantCalls: 0,
    rereads: 0,
    approvals: 0,
    approvalsDenied: 0,
    toolCounts: new Map(),
    pains: new Map(),
    duplicates: [],
    sequences: new Map(),
    userTexts: [],
    museum: null,
    exhibits: [],
  }
}

function addPain(digest, id, detail) {
  let entry = digest.pains.get(id)
  if (!entry) {
    entry = { count: 0, examples: [], tools: new Map() }
    digest.pains.set(id, entry)
  }
  entry.count += 1
  if (detail?.tool) entry.tools.set(detail.tool, (entry.tools.get(detail.tool) ?? 0) + 1)
  if (detail?.sample && entry.examples.length < 2) {
    const sample = truncate(detail.sample, SAMPLE_LIMIT)
    if (sample !== '' && !entry.examples.includes(sample)) entry.examples.push(sample)
  }
}

/** Fold one session log into a digest. Exported for the per-session page view. */
export function digestSession(input) {
  const digest = emptyDigest(input?.session)
  const minSeq = Number.isFinite(input?.inheritedEventCount) ? Number(input.inheritedEventCount) : 0
  const events = Array.isArray(input?.events) ? input.events : []
  const callKeys = new Map()
  const callNames = []
  const pathReads = new Map()
  const toolNameByCall = new Map()
  const approvalTools = new Map()
  const approvalCalls = new Map()
  const deniedCalls = new Set()

  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    if (Number.isFinite(event.seq) && minSeq > 0 && Number(event.seq) < minSeq) continue
    const time = Number(event.time)
    if (Number.isFinite(time) && time > digest.lastEventAt) digest.lastEventAt = time
    const data = event.data ?? {}
    switch (event.type) {
      case 'session/title': {
        const title = typeof data.title === 'string' ? data.title : ''
        if (title !== '') digest.title = truncate(title, 120)
        break
      }
      case 'turn/start':
        digest.turns += 1
        break
      case 'step/start':
        digest.steps += 1
        break
      case 'user/message': {
        const kind = data.source?.kind ?? 'user'
        if (kind !== 'user') {
          digest.injectedMessages += 1
          break
        }
        const text = messageText(data)
        if (text.trim() === '') break
        digest.userMessages += 1
        digest.userTexts.push(truncate(text, 500))
        const trimmed = text.trim()
        // A 400+ character message is a pasted brief, not a reaction to the
        // previous turn; keyword matches there would be noise.
        if (trimmed.length <= 400) {
          for (const signal of USER_SIGNALS) {
            const scope = signal.id === 'user-correction' ? trimmed.slice(0, 160) : trimmed
            if (signal.re.test(scope)) addPain(digest, signal.id, { sample: text })
          }
        }
        break
      }
      case 'tool/call': {
        const name = String(data.name ?? 'tool')
        const args = stableArguments(data.arguments)
        // A call with no arguments has nothing to distinguish; repeating
        // `job_list` is polling, not a duplicated workflow.
        if (args !== '' && args !== '{}') {
          const key = `${name}\u0000${args}`
          const count = (callKeys.get(key) ?? 0) + 1
          callKeys.set(key, count)
          if (count >= 2) {
            digest.redundantCalls += 1
            const dup = digest.duplicates.find((item) => item.tool === name && item.args === args)
            if (dup) dup.count = count
            else digest.duplicates.push({ tool: name, args, count })
          }
        }
        digest.toolCalls += 1
        digest.toolCounts.set(name, (digest.toolCounts.get(name) ?? 0) + 1)
        callNames.push(name)
        toolNameByCall.set(String(data.callId ?? ''), name)
        if (READ_TOOLS.has(name)) {
          const path = targetPath(data.arguments)
          if (path) {
            const seen = pathReads.get(path) ?? 0
            pathReads.set(path, seen + 1)
            if (seen === 1) digest.rereads += 1
          }
        }
        break
      }
      case 'tool/result': {
        const message = data.message
        const callId = String(message?.toolCallId ?? '')
        const name = toolNameByCall.get(callId) ?? 'tool'
        const text = messageText(message)
        const failure = failureOf(message, data, text)
        if (!failure) break
        digest.toolFailures += 1
        // A rejected approval already produced its own pain entry when the
        // decision was logged; counting the wrapper tool error too would
        // double the same refusal.
        if (deniedCalls.has(callId)) break
        addPain(digest, failureSpecies({
          text,
          tool: name,
          isError: failure.isError,
          errorCode: failure.errorCode,
          exitCode: failure.exitCode,
        }), { tool: name, sample: text })
        break
      }
      case 'turn/end': {
        const kind = data.reason?.kind ?? 'completed'
        if (kind === 'aborted' || kind === 'interrupted') {
          digest.abortedTurns += 1
          addPain(digest, 'turn-aborted', { sample: kind })
        } else if (kind === 'error') {
          addPain(digest, 'turn-error', { sample: data.reason?.error?.message ?? 'turn failed' })
        } else if (kind === 'max-tokens') {
          addPain(digest, 'turn-max-tokens', { sample: 'turn hit the max token budget' })
        }
        break
      }
      case 'approval/asked': {
        digest.approvals += 1
        const approvalId = String(data.id ?? '')
        approvalTools.set(approvalId, String(data.toolName ?? 'tool'))
        if (typeof data.callId === 'string') approvalCalls.set(approvalId, data.callId)
        break
      }
      case 'approval/decided': {
        const outcome = String(data.outcome ?? '')
        if (outcome === '' || /^allow/i.test(outcome)) break
        digest.approvalsDenied += 1
        const approvalId = String(data.id ?? '')
        const callId = approvalCalls.get(approvalId)
        if (callId) deniedCalls.add(callId)
        addPain(digest, 'approval-denied', {
          tool: approvalTools.get(approvalId) ?? 'tool',
          sample: outcome,
        })
        break
      }
      default:
        break
    }
  }

  // Repeated tool sequences: a 3-gram seen more than once inside one session.
  // A triple of one repeated tool says "this tool ran a lot", not "this flow
  // repeated", so only mixed triples are worth reporting.
  if (callNames.length >= 6) {
    const grams = new Map()
    for (let i = 0; i + 3 <= callNames.length; i += 1) {
      const window = callNames.slice(i, i + 3)
      if (new Set(window).size < 2) continue
      const pattern = window.join(' → ')
      grams.set(pattern, (grams.get(pattern) ?? 0) + 1)
    }
    for (const [pattern, count] of grams) {
      if (count >= 2) digest.sequences.set(pattern, count)
    }
  }

  digest.duplicates.sort((a, b) => b.count - a.count)
  digest.duplicates = digest.duplicates.slice(0, 3)

  // The museum is a second, context-aware read of the same log: it needs the
  // neighbours of every failure, which the scoring loop above never looks at.
  const museum = buildMuseum(events, {
    session: input?.session,
    inheritedEventCount: minSeq,
    title: digest.title,
  })
  digest.museum = museum.counters
  digest.exhibits = museum.exhibits
  return digest
}

function normalizePrompt(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[。，！？、；：“”‘’（）【】《》,.!?;:'"()[\]{}]/g, '')
    .trim()
}

/**
 * Severity of one session, used for ordering and for the board column.
 *
 * Weights are deliberate: an aborted turn or a denied approval says more about
 * friction than a hundred successful calls, and a user asking to retry counts
 * double because it means the previous explanation failed.
 */
export function sessionScore(digest) {
  return (
    digest.toolFailures * 2 +
    digest.abortedTurns * 3 +
    digest.approvalsDenied * 3 +
    (digest.pains.get('user-retry')?.count ?? 0) * 2 +
    (digest.pains.get('user-correction')?.count ?? 0)
  )
}

/** Board column for one session digest: pain-heavy, redundant, or calm. */
export function sessionStatus(digest) {
  if (sessionScore(digest) >= 12) return 'pain'
  if (digest.redundantCalls >= 4 || digest.rereads >= 3) return 'redundant'
  return 'ok'
}

function digestToSessionRow(digest, locale) {
  return {
    id: digest.id,
    title: digest.title || '',
    cwd: digest.cwd,
    status: sessionStatus(digest),
    score: sessionScore(digest),
    createdAt: digest.createdAt,
    lastEventAt: digest.lastEventAt,
    turns: digest.turns,
    steps: digest.steps,
    userMessages: digest.userMessages,
    toolCalls: digest.toolCalls,
    toolFailures: digest.toolFailures,
    redundantCalls: digest.redundantCalls,
    rereads: digest.rereads,
    abortedTurns: digest.abortedTurns,
    approvalsDenied: digest.approvalsDenied,
    topPains: [...digest.pains.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([id, entry]) => ({ id, label: painLabel(id, locale), count: entry.count })),
    topTools: [...digest.toolCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    worstDuplicate: digest.duplicates[0]
      ? { tool: digest.duplicates[0].tool, args: truncate(digest.duplicates[0].args, 120), count: digest.duplicates[0].count }
      : null,
  }
}

/** Everything the page shows for ONE session: its row plus the evidence behind it. */
export function describeSession(input, options = {}) {
  const locale = options.locale === 'en' ? 'en' : 'zh'
  const digest = digestSession(input)
  const row = digestToSessionRow(digest, locale)
  return {
    ...row,
    injectedMessages: digest.injectedMessages,
    approvals: digest.approvals,
    tools: [...digest.toolCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, share: digest.toolCalls === 0 ? 0 : count / digest.toolCalls })),
    pains: [...digest.pains.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([id, entry]) => ({
        id,
        label: painLabel(id, locale),
        advice: painAdvice(id, locale),
        kind: painKind(id),
        count: entry.count,
        tools: [...entry.tools.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => ({ name, count })),
        examples: entry.examples,
      })),
    duplicates: digest.duplicates.map((dup) => ({
      tool: dup.tool,
      args: truncate(dup.args, 200),
      count: dup.count,
    })),
    requests: digest.userTexts.slice(0, 10).map((text) => truncate(text, 220)),
    museum: digest.museum,
    exhibits: (digest.exhibits ?? []).map((exhibit, index) => ({
      ...exhibit,
      no: index + 1,
      speciesLabel: painLabel(exhibit.species, locale),
      speciesAdvice: painAdvice(exhibit.species, locale),
      speciesKind: painKind(exhibit.species),
    })),
  }
}

/**
 * Analyze one corpus.
 *
 * @param inputs  `{ session, events, inheritedEventCount }` per Session.
 * @param options `{ days, now, locale, maxSessions }`.
 */
/**
 * Fold already-built per-Session digests into one report.
 *
 * This is the half that costs almost nothing, which is why digests are what the
 * Host caches: a new report over 87 Sessions is aggregation over cached digests,
 * not a re-read of 87 logs.
 */
export function analyzeDigests(digests, options = {}) {
  const now = Number.isFinite(options.now) ? Number(options.now) : Date.now()
  const days = clamp(Number(options.days ?? 30) || 30, 1, 365)
  const locale = options.locale === 'en' ? 'en' : 'zh'
  const from = now - days * DAY_MS
  const warnings = Array.isArray(options.warnings) ? options.warnings.slice() : []
  const kept = []
  for (const digest of digests) {
    const createdAt = Number(digest?.createdAt ?? 0)
    if (Number.isFinite(createdAt) && createdAt > 0 && createdAt < from) continue
    kept.push(digest)
  }
  digests = kept

  // ---- corpus totals -------------------------------------------------------
  const totals = {
    sessions: digests.length,
    activeSessions: 0,
    turns: 0,
    steps: 0,
    userMessages: 0,
    toolCalls: 0,
    toolFailures: 0,
    redundantCalls: 0,
    rereads: 0,
    abortedTurns: 0,
    approvals: 0,
    approvalsDenied: 0,
  }
  const statusCounts = { pain: 0, redundant: 0, ok: 0 }
  for (const digest of digests) {
    totals.turns += digest.turns
    totals.steps += digest.steps
    totals.userMessages += digest.userMessages
    totals.toolCalls += digest.toolCalls
    totals.toolFailures += digest.toolFailures
    totals.redundantCalls += digest.redundantCalls
    totals.rereads += digest.rereads
    totals.abortedTurns += digest.abortedTurns
    totals.approvals += digest.approvals
    totals.approvalsDenied += digest.approvalsDenied
    if (digest.toolCalls > 0 || digest.userMessages > 0) totals.activeSessions += 1
    statusCounts[sessionStatus(digest)] += 1
  }
  totals.failureRate = totals.toolCalls === 0 ? 0 : totals.toolFailures / totals.toolCalls
  totals.redundancyRate = totals.toolCalls === 0 ? 0 : totals.redundantCalls / totals.toolCalls
  totals.callsPerUserMessage =
    totals.userMessages === 0 ? 0 : Math.round((totals.toolCalls / totals.userMessages) * 10) / 10
  totals.statusCounts = statusCounts

  // ---- pain points, aggregated across sessions ----------------------------
  const painTotals = new Map()
  for (const digest of digests) {
    for (const [id, entry] of digest.pains) {
      let total = painTotals.get(id)
      if (!total) {
        total = {
          id,
          label: painLabel(id, locale),
          advice: painAdvice(id, locale),
          kind: painKind(id),
          count: 0,
          sessions: new Set(),
          examples: [],
          tools: new Map(),
        }
        painTotals.set(id, total)
      }
      total.count += entry.count
      total.sessions.add(digest.id)
      for (const [tool, toolCount] of entry.tools) {
        total.tools.set(tool, (total.tools.get(tool) ?? 0) + toolCount)
      }
      for (const example of entry.examples) {
        if (total.examples.length < 3 && !total.examples.includes(example)) total.examples.push(example)
      }
    }
  }
  const painPoints = [...painTotals.values()]
    .map((total) => ({
      id: total.id,
      label: total.label,
      advice: total.advice,
      kind: total.kind,
      count: total.count,
      sessions: total.sessions.size,
      share: digests.length === 0 ? 0 : total.sessions.size / digests.length,
      tools: [...total.tools.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count })),
      examples: total.examples,
    }))
    .sort((a, b) => b.sessions - a.sessions || b.count - a.count)
    .slice(0, 10)

  // ---- redundant flows ----------------------------------------------------
  const flows = []

  // (a) the same call with the same arguments, more than once in one Session.
  const duplicateTotals = new Map()
  for (const digest of digests) {
    for (const dup of digest.duplicates) {
      if (dup.count < 2) continue
      const key = `${dup.tool}\u0000${dup.args}`
      let entry = duplicateTotals.get(key)
      if (!entry) {
        entry = { tool: dup.tool, args: dup.args, repeats: 0, sessions: 0 }
        duplicateTotals.set(key, entry)
      }
      entry.repeats += dup.count - 1
      entry.sessions += 1
    }
  }
  for (const entry of [...duplicateTotals.values()]
    .sort((a, b) => b.repeats - a.repeats || b.sessions - a.sessions)
    .slice(0, 4)) {
    flows.push({
      kind: 'duplicate-call',
      label: locale === 'zh' ? `重复调用 ${entry.tool}` : `Repeated ${entry.tool} call`,
      detail: entry.args,
      repeats: entry.repeats,
      sessions: entry.sessions,
    })
  }

  // (b) the same tool sequence inside one Session.
  const sequenceTotals = new Map()
  for (const digest of digests) {
    for (const [pattern, count] of digest.sequences) {
      if (count < 2) continue
      let entry = sequenceTotals.get(pattern)
      if (!entry) {
        entry = { pattern, occurrences: 0, sessions: 0 }
        sequenceTotals.set(pattern, entry)
      }
      entry.occurrences += count
      entry.sessions += 1
    }
  }
  for (const entry of [...sequenceTotals.values()]
    .sort((a, b) => b.occurrences - a.occurrences || b.sessions - a.sessions)
    .slice(0, 4)) {
    flows.push({
      kind: 'sequence',
      label: locale === 'zh' ? '重复的工具序列' : 'Repeated tool sequence',
      detail: entry.pattern,
      repeats: entry.occurrences,
      sessions: entry.sessions,
    })
  }

  // (c) the same request typed again, in one Session or across several.
  const promptTotals = new Map()
  for (const digest of digests) {
    const seenHere = new Set()
    for (const text of digest.userTexts) {
      const key = normalizePrompt(text)
      if (key.length < 8) continue
      let entry = promptTotals.get(key)
      if (!entry) {
        entry = { text: truncate(text, 160), count: 0, sessions: new Set() }
        promptTotals.set(key, entry)
      }
      entry.count += 1
      if (!seenHere.has(key)) {
        entry.sessions.add(digest.id)
        seenHere.add(key)
      }
    }
  }
  for (const entry of [...promptTotals.values()]
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)) {
    flows.push({
      kind: 'repeat-prompt',
      label: locale === 'zh' ? '重复提出的需求' : 'Request asked again',
      detail: entry.text,
      repeats: entry.count,
      sessions: entry.sessions.size,
    })
  }

  // ---- per-session board rows --------------------------------------------
  const maxRows = clamp(Number(options.maxSessions ?? 300) || 300, 1, 1000)
  const sessions = digests
    .map((digest) => digestToSessionRow(digest, locale))
    .sort((a, b) => b.lastEventAt - a.lastEventAt || b.createdAt - a.createdAt)
    .slice(0, maxRows)

  // ---- the museum ---------------------------------------------------------
  // Exhibits are curated per Session at read time (the interesting eight, with
  // their trajectories); this step only merges counters and picks the wall.
  const museum = aggregateMuseum(digests, {
    locale,
    now,
    from,
    maxExhibits: options.maxExhibits ?? 90,
  })

  return {
    version: 3,
    generatedAt: now,
    range: { days, from, to: now },
    totals,
    painPoints,
    redundantFlows: flows.slice(0, 8),
    sessions,
    museum,
    warnings,
  }
}

/**
 * Analyze raw Session logs in one call: digest each, then aggregate.
 *
 * The Host uses the two halves separately so it can cache digests; this wrapper
 * keeps the simple path (tests, probes) on the same code.
 *
 * @param inputs  `{ session, events, inheritedEventCount }` per Session.
 * @param options `{ days, now, locale, maxSessions, warnings }`.
 */
export function analyzeSessions(inputs, options = {}) {
  const warnings = []
  const digests = []
  for (const input of inputs) {
    if (input?.error) {
      warnings.push({
        code: 'SESSION_READ_FAILED',
        sessionId: String(input.session?.id ?? ''),
        message: truncate(String(input.error), 200),
      })
      continue
    }
    try {
      digests.push(digestSession(input))
    } catch (error) {
      warnings.push({
        code: 'SESSION_ANALYSIS_FAILED',
        sessionId: String(input?.session?.id ?? ''),
        message: truncate(error instanceof Error ? error.message : String(error), 200),
      })
    }
  }
  return analyzeDigests(digests, { ...options, warnings: warnings.concat(options.warnings ?? []) })
}

/**
 * Bumped whenever a digest's meaning changes, so a cached record written by an
 * older scoring rule is re-read instead of trusted.
 */
export const DIGEST_VERSION = 3

/** JSON-safe form of one digest (Maps and Sets are not serializable). */
export function serializeDigest(digest) {
  return {
    id: digest.id,
    title: digest.title,
    cwd: digest.cwd,
    createdAt: digest.createdAt,
    lastEventAt: digest.lastEventAt,
    turns: digest.turns,
    steps: digest.steps,
    userMessages: digest.userMessages,
    injectedMessages: digest.injectedMessages,
    toolCalls: digest.toolCalls,
    toolFailures: digest.toolFailures,
    abortedTurns: digest.abortedTurns,
    redundantCalls: digest.redundantCalls,
    rereads: digest.rereads,
    approvals: digest.approvals,
    approvalsDenied: digest.approvalsDenied,
    toolCounts: [...digest.toolCounts],
    pains: [...digest.pains].map(([id, entry]) => [id, { count: entry.count, examples: entry.examples, tools: [...entry.tools] }]),
    duplicates: digest.duplicates,
    sequences: [...digest.sequences],
    userTexts: digest.userTexts,
    museum: digest.museum,
    exhibits: digest.exhibits,
  }
}

/** Rebuild a digest from `serializeDigest` output; null when the shape is wrong. */
export function hydrateDigest(data) {
  if (!data || typeof data !== 'object') return null
  if (typeof data.id !== 'string' || data.id === '') return null
  if (!Array.isArray(data.toolCounts) || !Array.isArray(data.pains) || !Array.isArray(data.userTexts)) return null
  const pains = new Map()
  for (const entry of data.pains) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue
    const value = entry[1] ?? {}
    pains.set(entry[0], {
      count: Number(value.count) || 0,
      examples: Array.isArray(value.examples) ? value.examples.filter((text) => typeof text === 'string') : [],
      tools: new Map(Array.isArray(value.tools) ? value.tools.filter((item) => Array.isArray(item) && item.length === 2) : []),
    })
  }
  return {
    ...data,
    toolCounts: new Map(Array.isArray(data.toolCounts) ? data.toolCounts.filter((item) => Array.isArray(item) && item.length === 2) : []),
    sequences: new Map(Array.isArray(data.sequences) ? data.sequences.filter((item) => Array.isArray(item) && item.length === 2) : []),
    duplicates: Array.isArray(data.duplicates) ? data.duplicates : [],
    userTexts: data.userTexts.filter((text) => typeof text === 'string'),
    museum: data.museum && typeof data.museum === 'object' ? data.museum : null,
    exhibits: Array.isArray(data.exhibits) ? data.exhibits : [],
    pains,
  }
}

export { PAIN_LABELS, PAIN_SIGNATURE_IDS } from './pain.js'
