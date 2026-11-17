/**
 * The Error Museum: every authoritative failure becomes an exhibit with the
 * trajectory around it — what the model was doing before, what it said after,
 * and what it actually did next.
 *
 * Two questions drive the taxonomy, both asked by a reader of the panel:
 *
 *  - 处置 (handling): did the model read the error and change course, or did it
 *    press the same button again? Verbatim retry is a distinct exhibit class,
 *    because "it worked on the second try" and "I tried the same broken thing
 *    twice" look identical in a failure count.
 *  - 自省 (regret): did the model name its own mistake ("I read it with pwsh,
 *    not the read tool") before correcting? A retry without a stated reason is
 *    luck; a stated reason is a mechanism.
 *
 * Everything here is deterministic and evidence-only: a verdict is derived from
 * the next few events, and a quoted line is copied verbatim from the log. The
 * module is pure so the probes can run it over the real corpus.
 */

import { failureSpecies, painAdvice, painKind, painLabel } from './pain.js'
import { argumentsPreview, messageText, oneLine, reasoningText, stableArguments, truncate } from './text.js'

const MAX_EXHIBITS_PER_SESSION = 8
const BEFORE_STEPS = 3
const AFTER_STEPS = 4
const QUOTE_LIMIT = 220
const ERROR_LIMIT = 240
const TEXT_LIMIT = 200
const ARGS_LIMIT = 120
const DAY_MS = 86_400_000

/** Strong markers: the model names its own mistake. */
const SELF_CORRECT =
  /(抱歉|对不起|我错|是我错|搞错|看错|误以为|误解|我的失误|是我的疏忽|看漏|漏看|忽略了这一点|I was wrong|my mistake|my bad|I apologi[sz]e|I'm sorry|I am sorry|I confused|I misread|I misunderstood|I incorrectly|wrong tool|not the read tool|not the edit tool|should have (?:read|used|checked|run)|I (?:had )?missed that|I forgot to)/i

/** Course changes: the model states a different plan, without admitting fault. */
const REPLAN =
  /(应该先|需要先|先读取|先读一下|先确认|改用|换成|重新读取|重新尝试|重试一次|换一种|换个方法|换个思路|let me (?:re-?read|re-?check|re-?try|try|use|switch)|need to (?:first|read|observe|check)|try (?:a )?different|instead|rather than|re-?run|re-?read|adjust(?:ed)? the)/i

/** The model mentions the failure at all — acknowledgement without a plan. */
const ACKNOWLEDGE =
  /(失败|报错|错误|异常|拒绝|不可用|超时|没找到|找不到|越界|空操作|error|failed|failure|denied|rejected|timed out|not found|unavailable|out of range|no-op)/i

/** Failure-side words that make a sentence relevant to *this* exhibit. */
const ERROR_WORDS =
  /(error|fail|reject|deny|denied|cannot|can't|unable|invalid|missing|not found|timed out|changed since|no longer|out of range|permission|blocked|refused|失败|报错|错误|异常|拒绝|超时|无法|不能|不存在|找不到|越界|权限|被拦|不允许)/i

function pctText(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0%'
  return `${(number * 100).toFixed(number > 0 && number < 0.01 ? 1 : 0)}%`
}

/** Local calendar day of one failure, as `YYYY-MM-DD`; '' when the time is unusable. */
function dayKey(time) {
  if (!Number.isFinite(time) || time <= 0) return ''
  const date = new Date(time)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Cut a reasoning blob into candidate sentences, capped and trimmed. */
function sentences(text) {
  const out = []
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (line.trim() === '') continue
    let buffer = ''
    for (const char of line) {
      buffer += char
      if (char === '。' || char === '！' || char === '？') {
        if (buffer.trim() !== '') out.push(buffer.trim())
        buffer = ''
      }
    }
    if (buffer.trim() !== '') out.push(buffer.trim())
  }
  // Split long English sentences too, but only at a space + capital, so a flag
  // like `--force` or a path never becomes its own "sentence".
  const refined = []
  for (const sentence of out) {
    for (const part of sentence.split(/(?<=[.!?])\s+(?=[A-Z"'`(])/)) {
      const trimmed = part.trim()
      if (trimmed !== '') refined.push(trimmed.length > 400 ? `${trimmed.slice(0, 399)}…` : trimmed)
    }
  }
  return refined.slice(0, 80)
}

/** Is this sentence about the failure that just happened? */
function relevantTo(sentence, { tool, error }) {
  if (!sentence) return false
  if (ERROR_WORDS.test(sentence)) return true
  if (tool && tool !== 'tool' && new RegExp(`\\b${tool}\\b`, 'i').test(sentence)) return true
  const head = String(error ?? '').slice(0, 24).trim()
  return head.length >= 8 && sentence.toLowerCase().includes(head.toLowerCase())
}

/** Classify the first assistant reaction after a failure. */
function extractReflection(message, context = {}) {
  const sources = [
    { source: 'reasoning', text: reasoningText(message) },
    { source: 'text', text: messageText(message) },
  ]
  let best = null
  for (const item of sources) {
    if (!item.text) continue
    for (const sentence of sentences(item.text)) {
      const strong = SELF_CORRECT.test(sentence)
      const replan = REPLAN.test(sentence)
      const acknowledge = ACKNOWLEDGE.test(sentence)
      if (!strong && !replan && !acknowledge) continue
      const relevant = relevantTo(sentence, context)
      if (!strong && !relevant) continue
      const score = (strong ? 5 : replan ? 3 : 1) + (relevant ? 2 : 0)
      if (!best || score > best.score) {
        best = {
          score,
          kind: strong ? 'self-correct' : replan ? 'replan' : 'acknowledge',
          source: item.source,
          quote: truncate(oneLine(sentence), QUOTE_LIMIT),
        }
      }
    }
  }
  if (!best || best.score < 3) return { kind: 'none', source: '', quote: '' }
  return { kind: best.kind, source: best.source, quote: best.quote }
}

function textAfterOf(message) {
  const text = messageText(message)
  return text.trim() === '' ? '' : truncate(oneLine(text), TEXT_LIMIT)
}

function callPreview(call) {
  return {
    tool: call.tool,
    args: argumentsPreview(call.args, ARGS_LIMIT),
    key: call.key,
  }
}

function stepPreview(call) {
  return {
    tool: call.tool,
    args: argumentsPreview(call.args, ARGS_LIMIT),
    ok: call.result ? call.result.ok : null,
    failed: call.result?.failed === true,
  }
}

function failureSpeciesOf(message, data, text, call) {
  const isError = message?.isError === true
  const errorCode = typeof data?.error?.code === 'string' ? data.error.code : ''
  const exit = /\[exit code: ([1-9]\d*)\]\s*$/.exec(text)
  if (!isError && !errorCode && !exit) return null
  // A rejected approval reaches us as a tool error; the species is the refusal,
  // not the shell wrapper that carried it.
  const species = call?.approvalOutcome && !/^allow/i.test(call.approvalOutcome)
    ? 'approval-denied'
    : failureSpecies({
        text,
        tool: call?.tool ?? '',
        isError,
        errorCode,
        exitCode: exit ? Number(exit[1]) : 0,
      })
  return {
    species,
    isError,
    errorCode,
    exitCode: exit ? Number(exit[1]) : 0,
  }
}

/**
 * Walk one Session log and return its exhibits plus aggregate counters.
 *
 * `events` is the raw log (the digest caller has already applied the inherited
 * sequence fence through `inheritedEventCount`).
 */
export function buildMuseum(events, options = {}) {
  const list = []
  const minSeq = Number.isFinite(options.inheritedEventCount) ? Number(options.inheritedEventCount) : 0
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== 'object') continue
    if (Number.isFinite(event.seq) && minSeq > 0 && Number(event.seq) < minSeq) continue
    list.push(event)
  }

  const session = options.session ?? {}
  const sessionId = String(session.id ?? options.sessionId ?? '')
  const title = typeof options.title === 'string' ? options.title : ''

  const calls = new Map()
  const approvals = new Map()
  const turnByIndex = []
  let turnNo = 0

  // Pass 1: every call with the result that belongs to it, so a forward scan can
  // ask "did this next call succeed?" without re-reading the log.
  for (let index = 0; index < list.length; index += 1) {
    const event = list[index]
    const data = event.data ?? {}
    if (event.type === 'turn/start') turnNo += 1
    turnByIndex[index] = turnNo
    if (event.type === 'tool/call') {
      const call = {
        index,
        callId: String(data.callId ?? ''),
        tool: String(data.name ?? 'tool'),
        args: typeof data.arguments === 'string' ? data.arguments : '',
        key: stableArguments(data.arguments),
        approvalOutcome: '',
        result: null,
      }
      calls.set(call.callId, call)
    } else if (event.type === 'tool/result') {
      const message = data.message
      const callId = String(message?.toolCallId ?? '')
      const call = calls.get(callId)
      const text = messageText(message)
      const failure = failureSpeciesOf(message, data, text, call)
      if (!call) continue
      call.result = {
        index,
        ok: failure === null,
        failed: failure !== null,
        species: failure?.species ?? '',
        text: truncate(oneLine(text), ERROR_LIMIT),
        errorCode: failure?.errorCode ?? '',
      }
    } else if (event.type === 'approval/asked') {
      approvals.set(String(data.id ?? ''), { callId: String(data.callId ?? ''), toolName: String(data.toolName ?? '') })
    } else if (event.type === 'approval/decided') {
      const entry = approvals.get(String(data.id ?? ''))
      const outcome = String(data.outcome ?? '')
      if (!entry || outcome === '' || /^allow/i.test(outcome)) continue
      const call = calls.get(entry.callId)
      if (call) call.approvalOutcome = outcome
    }
  }

  const exhibits = []
  const counters = {
    total: 0,
    fixed: 0,
    repeated: 0,
    handback: 0,
    stalled: 0,
    pending: 0,
    refused: 0,
    selfCorrect: 0,
    replan: 0,
    acknowledge: 0,
    verbatim: 0,
    fixStepSum: 0,
    fixStepCount: 0,
    halls: { restored: 0, retried: 0, handback: 0, stalled: 0 },
    species: {},
    tools: {},
    daily: {},
    firstAt: 0,
    lastAt: 0,
  }

  const bumpSpecies = (id, field) => {
    if (!id) return
    const entry = counters.species[id] ?? { count: 0, fixed: 0, repeated: 0, reflected: 0, refused: 0 }
    if (field) entry[field] += 1
    else entry.count += 1
    counters.species[id] = entry
  }

  const push = (exhibit) => {
    counters.total += 1
    counters[exhibit.outcome] = (counters[exhibit.outcome] ?? 0) + 1
    counters.halls[exhibit.hall] = (counters.halls[exhibit.hall] ?? 0) + 1
    if (exhibit.refused) counters.refused += 1
    if (exhibit.reflection.kind === 'self-correct') counters.selfCorrect += 1
    else if (exhibit.reflection.kind === 'replan') counters.replan += 1
    else if (exhibit.reflection.kind === 'acknowledge') counters.acknowledge += 1
    if (exhibit.verdict === 'retried-verbatim') counters.verbatim += 1
    if (exhibit.outcome === 'fixed' && exhibit.stepsToFix > 0) {
      counters.fixStepSum += exhibit.stepsToFix
      counters.fixStepCount += 1
    }
    bumpSpecies(exhibit.species)
    if (exhibit.outcome === 'fixed') bumpSpecies(exhibit.species, 'fixed')
    if (exhibit.outcome === 'repeated') bumpSpecies(exhibit.species, 'repeated')
    if (exhibit.reflection.kind === 'self-correct' || exhibit.reflection.kind === 'replan') bumpSpecies(exhibit.species, 'reflected')
    if (exhibit.refused) bumpSpecies(exhibit.species, 'refused')
    counters.tools[exhibit.tool] = (counters.tools[exhibit.tool] ?? 0) + 1
    const day = dayKey(exhibit.time)
    if (day) counters.daily[day] = (counters.daily[day] ?? 0) + 1
    if (exhibit.time > 0) {
      if (counters.firstAt === 0 || exhibit.time < counters.firstAt) counters.firstAt = exhibit.time
      if (exhibit.time > counters.lastAt) counters.lastAt = exhibit.time
    }
    exhibits.push(exhibit)
  }

  /** Forward context: the model's reaction, its next calls, and how they ended. */
  function forwardOf(index) {
    const afterCalls = []
    let reflectionMessage = null
    let assistantText = ''
    let turnEnd = ''
    for (let cursor = index + 1; cursor < list.length; cursor += 1) {
      const event = list[cursor]
      if (!event || typeof event !== 'object') continue
      if (event.type === 'turn/end') {
        turnEnd = String(event.data?.reason?.kind ?? '')
        break
      }
      if (event.type === 'user/message' || event.type === 'turn/start') break
      if (event.type === 'assistant/message') {
        if (!reflectionMessage) {
          reflectionMessage = event.data?.message
          assistantText = textAfterOf(event.data?.message)
        }
        continue
      }
      if (event.type === 'tool/call') {
        const call = calls.get(String(event.data?.callId ?? ''))
        if (call && afterCalls.length < AFTER_STEPS) afterCalls.push(call)
      }
    }
    return { calls: afterCalls, reflection: reflectionMessage, assistantText, turnEnd }
  }

  function beforeOf(index, excludeCallId) {
    const rows = []
    for (let cursor = index - 1; cursor >= 0 && rows.length < BEFORE_STEPS; cursor -= 1) {
      const event = list[cursor]
      if (event?.type === 'tool/call') {
        const call = calls.get(String(event.data?.callId ?? ''))
        if (!call || call.callId === excludeCallId) continue
        rows.push(stepPreview(call))
      }
    }
    return rows.reverse()
  }

  function distanceToFix(afterCalls) {
    for (let i = 0; i < afterCalls.length; i += 1) {
      if (afterCalls[i].result?.ok) return i + 1
    }
    return 0
  }

  function judge(after, failing) {
    const callsAfter = after.calls
    const first = callsAfter[0]
    const hasText = after.assistantText !== ''
    if (!first) {
      if (after.turnEnd === 'error' || after.turnEnd === 'max-tokens') {
        return { verdict: 'none', outcome: 'stalled', hall: 'stalled', repeated: false, success: false }
      }
      if (hasText) return { verdict: 'handback', outcome: 'handback', hall: 'handback', repeated: false, success: false }
      return { verdict: 'none', outcome: 'stalled', hall: 'stalled', repeated: false, success: false }
    }
    const sameKey = failing.key !== '' && first.key !== '' && first.key === failing.key
    const sameTool = first.tool === failing.tool
    const verdict = sameKey ? 'retried-verbatim' : sameTool ? 'retried-adjusted' : 'switched-tool'
    const repeated = callsAfter.some(
      (call) =>
        call.result?.failed === true &&
        (call.result.species === failing.species || (failing.key !== '' && call.key === failing.key)),
    )
    const success = callsAfter.some((call) => call.result?.ok === true)
    const settled = callsAfter.some((call) => call.result !== null)
    // A live Session's last failure may still be in flight; say so instead of
    // filing a retry that never happened.
    if (!repeated && !success && !settled && after.turnEnd === '') {
      return { verdict, outcome: 'pending', hall: 'stalled', repeated: false, success: false }
    }
    let outcome
    if (repeated) outcome = 'repeated'
    else if (success) outcome = 'fixed'
    else if (hasText) outcome = 'handback'
    else outcome = 'stalled'
    const hall =
      repeated || verdict === 'retried-verbatim'
        ? 'retried'
        : outcome === 'fixed'
          ? 'restored'
          : outcome === 'handback'
            ? 'handback'
            : 'stalled'
    return { verdict, outcome, hall, repeated, success }
  }

  let verbatimRun = 0
  for (let index = 0; index < list.length; index += 1) {
    const event = list[index]
    if (event.type === 'tool/result') {
      const message = event.data?.message
      const callId = String(message?.toolCallId ?? '')
      const call = calls.get(callId)
      if (!call || !call.result?.failed) continue
      const text = messageText(message)
      const after = forwardOf(index)
      const failing = {
        tool: call.tool,
        key: call.key,
        species: call.result.species,
      }
      const judged = judge(after, failing)
      verbatimRun = 0
      for (const next of after.calls) {
        if (failing.key !== '' && next.key === failing.key) verbatimRun += 1
        else break
      }
      const reflection = extractReflection(after.reflection, { tool: call.tool, error: call.result.text })
      const stepsToFix = judged.success ? distanceToFix(after.calls) : 0
      const refused = call.approvalOutcome !== '' && !/^allow/i.test(call.approvalOutcome)
      const exhibit = {
        id: `${sessionId}#${String(event.seq ?? index)}`,
        seq: Number(event.seq ?? index),
        time: Number(event.time ?? 0),
        turn: turnByIndex[index] ?? 0,
        kind: 'tool',
        species: call.result.species,
        tool: call.tool,
        errorCode: call.result.errorCode,
        error: call.result.text,
        call: callPreview(call),
        before: beforeOf(index, callId),
        after: after.calls.map(stepPreview),
        assistantText: after.assistantText,
        reflection,
        verdict: judged.verdict,
        outcome: judged.outcome,
        hall: judged.hall,
        repeated: judged.repeated === true,
        eventuallyFixed: judged.success === true,
        refused,
        retries: verbatimRun,
        stepsToFix,
        sessionId,
        sessionTitle: title,
      }
      exhibit.interest =
        (reflection.kind === 'self-correct' ? 6 : reflection.kind === 'replan' ? 3 : 0) +
        (judged.outcome === 'repeated' ? 4 : 0) +
        (judged.verdict === 'retried-verbatim' ? 3 : 0) +
        (refused ? 2 : 0) +
        (judged.outcome === 'fixed' ? 2 : 0)
      push(exhibit)
      continue
    }
    if (event.type === 'turn/end') {
      const reason = event.data?.reason ?? {}
      const kind = String(reason.kind ?? '')
      if (kind !== 'error' && kind !== 'max-tokens') continue
      const after = forwardOf(index)
      const species = kind === 'error' ? 'turn-error' : 'turn-max-tokens'
      const evidence = truncate(
        oneLine(kind === 'error' ? (reason.error?.message ?? 'turn failed') : 'turn hit the max token budget'),
        ERROR_LIMIT,
      )
      const exhibit = {
        id: `${sessionId}#${String(event.seq ?? index)}`,
        seq: Number(event.seq ?? index),
        time: Number(event.time ?? 0),
        turn: turnByIndex[index] ?? 0,
        kind: 'turn',
        species,
        tool: '',
        errorCode: '',
        error: evidence,
        call: null,
        before: beforeOf(index, ''),
        after: after.calls.map(stepPreview),
        assistantText: after.assistantText,
        reflection: { kind: 'none', source: '', quote: '' },
        verdict: 'none',
        outcome: 'stalled',
        hall: 'stalled',
        repeated: false,
        eventuallyFixed: false,
        refused: false,
        retries: 0,
        stepsToFix: 0,
        sessionId,
        sessionTitle: title,
        interest: -2,
      }
      push(exhibit)
    }
  }

  // One session contributes its most instructive exhibits, not its first eight:
  // a museum wall wants the self-corrections and the loops, not the noise.
  exhibits.sort((a, b) => b.interest - a.interest || b.time - a.time)
  const selected = exhibits.slice(0, MAX_EXHIBITS_PER_SESSION)
  selected.sort((a, b) => a.time - b.time || a.seq - b.seq)
  return { exhibits: selected, counters }
}

/** Merge one Session's museum counters and exhibits into the corpus report. */
export function aggregateMuseum(digests, options = {}) {
  const locale = options.locale === 'en' ? 'en' : 'zh'
  const zh = locale === 'zh'
  const now = Number.isFinite(options.now) ? Number(options.now) : Date.now()
  const maxExhibits = Math.min(160, Math.max(1, Math.trunc(Number(options.maxExhibits) || 90)))

  const totals = {
    exhibits: 0,
    fixed: 0,
    repeated: 0,
    handback: 0,
    stalled: 0,
    pending: 0,
    refused: 0,
    selfCorrect: 0,
    replan: 0,
    acknowledge: 0,
    verbatim: 0,
    fixStepSum: 0,
    fixStepCount: 0,
    halls: { restored: 0, retried: 0, handback: 0, stalled: 0 },
    sessions: 0,
    firstAt: 0,
    lastAt: 0,
  }
  const speciesMap = new Map()
  const dailyMap = new Map()
  const collected = []

  for (const digest of Array.isArray(digests) ? digests : []) {
    const counters = digest?.museum
    if (!counters || typeof counters !== 'object') continue
    for (const key of ['exhibits', 'fixed', 'repeated', 'handback', 'stalled', 'pending', 'refused', 'selfCorrect', 'replan', 'acknowledge', 'verbatim', 'fixStepSum', 'fixStepCount']) {
      const value = key === 'exhibits' ? Number(counters.total ?? 0) : Number(counters[key] ?? 0)
      if (key === 'exhibits') totals.exhibits += value
      else totals[key] += value
    }
    if (Number(counters.total ?? 0) > 0) totals.sessions += 1
    for (const [hall, count] of Object.entries(counters.halls ?? {})) {
      if (hall in totals.halls) totals.halls[hall] += Number(count) || 0
    }
    if (Number(counters.firstAt ?? 0) > 0 && (totals.firstAt === 0 || Number(counters.firstAt) < totals.firstAt)) totals.firstAt = Number(counters.firstAt)
    if (Number(counters.lastAt ?? 0) > totals.lastAt) totals.lastAt = Number(counters.lastAt)
    for (const [id, entry] of Object.entries(counters.species ?? {})) {
      const total = speciesMap.get(id) ?? { id, count: 0, fixed: 0, repeated: 0, reflected: 0, refused: 0, sessions: new Set() }
      total.count += Number(entry.count ?? 0)
      total.fixed += Number(entry.fixed ?? 0)
      total.repeated += Number(entry.repeated ?? 0)
      total.reflected += Number(entry.reflected ?? 0)
      total.refused += Number(entry.refused ?? 0)
      total.sessions.add(digest.id)
      speciesMap.set(id, total)
    }
    for (const [day, count] of Object.entries(counters.daily ?? {})) {
      if (day === '') continue
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + (Number(count) || 0))
    }
    for (const exhibit of Array.isArray(digest.exhibits) ? digest.exhibits : []) {
      collected.push({
        ...exhibit,
        sessionId: exhibit.sessionId || digest.id,
        sessionTitle: exhibit.sessionTitle || digest.title || '',
        speciesLabel: painLabel(exhibit.species, locale),
        speciesAdvice: painAdvice(exhibit.species, locale),
        speciesKind: painKind(exhibit.species),
      })
    }
  }

  const species = [...speciesMap.values()]
    .map((entry) => ({
      id: entry.id,
      label: painLabel(entry.id, locale),
      advice: painAdvice(entry.id, locale),
      kind: painKind(entry.id),
      count: entry.count,
      sessions: entry.sessions.size,
      fixed: entry.fixed,
      repeated: entry.repeated,
      reflected: entry.reflected,
      refused: entry.refused,
      share: totals.sessions === 0 ? 0 : entry.sessions.size / totals.sessions,
    }))
    .sort((a, b) => b.count - a.count || b.sessions - a.sessions)
    .slice(0, 16)

  collected.sort((a, b) => (b.interest ?? 0) - (a.interest ?? 0) || b.time - a.time)

  // Daily accessions: exact counts from the per-session day buckets, padded to
  // one entry per local calendar day in the window so gaps read as zero.
  const windowFrom = Number.isFinite(options.from) ? Number(options.from) : now - 30 * DAY_MS
  const seriesFrom = Math.max(windowFrom, now - 120 * DAY_MS)
  const daily = []
  const cursor = new Date(seriesFrom)
  cursor.setHours(0, 0, 0, 0)
  const lastDay = new Date(now)
  lastDay.setHours(0, 0, 0, 0)
  while (cursor.getTime() <= lastDay.getTime()) {
    const key = dayKey(cursor.getTime())
    daily.push({ date: key, count: dailyMap.get(key) ?? 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  const recent7d = daily.slice(-7).reduce((sum, day) => sum + day.count, 0)

  // A wall picked purely by interest collapses into two halls (self-corrections
  // and loops score highest) and hides the quiet endings. Reserve room per hall
  // and per leading species, then fill the rest by interest.
  const chosen = new Map()
  const hallQuota = { restored: 14, retried: 14, handback: 8, stalled: 8 }
  for (const [hall, quota] of Object.entries(hallQuota)) {
    let taken = 0
    for (const exhibit of collected) {
      if (taken >= quota) break
      if (exhibit.hall === hall) {
        chosen.set(exhibit.id, exhibit)
        taken += 1
      }
    }
  }
  for (const row of species.slice(0, 8)) {
    let taken = 0
    for (const exhibit of collected) {
      if (taken >= 3 || chosen.size >= maxExhibits) break
      if (exhibit.species === row.id && !chosen.has(exhibit.id)) {
        chosen.set(exhibit.id, exhibit)
        taken += 1
      }
    }
  }
  for (const exhibit of collected) {
    if (chosen.size >= maxExhibits) break
    chosen.set(exhibit.id, exhibit)
  }
  const selected = [...chosen.values()].slice(0, maxExhibits)
  selected.sort((a, b) => b.time - a.time || b.seq - a.seq)
  selected.forEach((exhibit, index) => {
    exhibit.no = index + 1
    delete exhibit.interest
  })

  const total = totals.exhibits
  const recoveryRate = total === 0 ? 0 : totals.fixed / total
  const repeatRate = total === 0 ? 0 : totals.repeated / total
  const verbatimRate = total === 0 ? 0 : totals.verbatim / total
  const reflectionCount = totals.selfCorrect + totals.replan
  const reflectionRate = total === 0 ? 0 : reflectionCount / total
  const avgStepsToFix = totals.fixStepCount === 0 ? 0 : Math.round((totals.fixStepSum / totals.fixStepCount) * 10) / 10
  const top = species[0] ?? null

  const notes = []
  if (top) {
    notes.push({
      id: 'top',
      text: zh
        ? `最常见的藏品是「${top.label}」：${top.count} 件，来自 ${top.sessions} 个会话。${top.advice}`
        : `The most common exhibit is "${top.label}": ${top.count} pieces from ${top.sessions} Sessions. ${top.advice}`,
    })
  }
  notes.push({
    id: 'retry',
    text: zh
      ? `${totals.verbatim} 件（${pctText(verbatimRate)}）在失败后原样重试了同一调用；${totals.repeated} 件以同一错误再次入馆。`
      : `${totals.verbatim} pieces (${pctText(verbatimRate)}) repeated the identical call after failing; ${totals.repeated} came back with the same error.`,
  })
  notes.push({
    id: 'regret',
    text:
      reflectionCount === 0
        ? zh
          ? `没有一件藏品留下自省记录——所有恢复都来自试错。`
          : `No exhibit records the model naming its own mistake; every recovery came from trial and error.`
        : zh
          ? `${reflectionCount} 件（${pctText(reflectionRate)}）留下了自省记录，其中 ${totals.selfCorrect} 件明确承认了自己的错误。`
          : `${reflectionCount} pieces (${pctText(reflectionRate)}) record the model revising its own plan, and ${totals.selfCorrect} name the mistake outright.`,
  })
  notes.push({
    id: 'recovery',
    text: zh
      ? `复原 ${totals.fixed} 件（${pctText(recoveryRate)}），平均 ${avgStepsToFix} 步回到正轨；${totals.handback + totals.stalled} 件停在交还或搁置。`
      : `${totals.fixed} recovered (${pctText(recoveryRate)}), ${avgStepsToFix} calls on average back on track; ${totals.handback + totals.stalled} ended handed back or stalled.`,
  })

  return {
    version: 1,
    stats: {
      exhibits: total,
      fixed: totals.fixed,
      repeated: totals.repeated,
      handback: totals.handback,
      stalled: totals.stalled,
      pending: totals.pending,
      refused: totals.refused,
      selfCorrect: totals.selfCorrect,
      replan: totals.replan,
      acknowledge: totals.acknowledge,
      reflectionCount,
      verbatim: totals.verbatim,
      sessions: totals.sessions,
      speciesCount: species.length,
      recoveryRate,
      repeatRate,
      verbatimRate,
      reflectionRate,
      avgStepsToFix,
      recent7d,
      firstAt: totals.firstAt,
      lastAt: totals.lastAt,
      halls: totals.halls,
    },
    species,
    notes,
    daily,
    exhibits: selected,
  }
}
