/**
 * Compact, model-readable digest of ONE session log.
 *
 * The dashboard answers "which Sessions are worth a closer look"; this text is
 * what the configured model reads when the user asks for the deeper audit. It
 * keeps the evidence that reveals redundancy and pain — the request sequence,
 * the tool timeline with repeated calls collapsed, and the verbatim failures —
 * and deliberately drops assistant prose and tool output bodies.
 */

import { argumentsPreview, clock, messageText, oneLine, truncate } from './text.js'

const DEFAULT_BUDGET = 14_000

/**
 * Build the prompt body for one Session.
 *
 * @param input `{ session, events, inheritedEventCount }`.
 * @param options `{ budget, locale }`.
 */
export function buildSessionDigest(input, options = {}) {
  const budget = Number.isFinite(options.budget) ? Number(options.budget) : DEFAULT_BUDGET
  const locale = options.locale === 'en' ? 'en' : 'zh'
  const zh = locale === 'zh'
  const session = input?.session ?? {}
  const events = Array.isArray(input?.events) ? input.events : []
  const minSeq = Number.isFinite(input?.inheritedEventCount) ? Number(input.inheritedEventCount) : 0

  const requests = []
  const timeline = []
  const failures = []
  const painCounts = new Map()
  const toolCounts = new Map()
  const toolNamesByCall = new Map()
  let turns = 0
  let steps = 0
  let toolCalls = 0
  let injected = 0
  let lastTime = 0

  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    if (Number.isFinite(event.seq) && minSeq > 0 && Number(event.seq) < minSeq) continue
    const time = Number(event.time)
    if (Number.isFinite(time) && time > lastTime) lastTime = time
    const data = event.data ?? {}
    if (event.type === 'turn/start') turns += 1
    else if (event.type === 'step/start') steps += 1
    else if (event.type === 'user/message') {
      if ((data.source?.kind ?? 'user') !== 'user') {
        injected += 1
        continue
      }
      const text = messageText(data)
      if (text.trim() === '') continue
      requests.push({ time, text: truncate(text, 320) })
      timeline.push({ kind: 'user', time, text: oneLine(text, 140) })
    } else if (event.type === 'tool/call') {
      toolCalls += 1
      const name = String(data.name ?? 'tool')
      toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1)
      toolNamesByCall.set(String(data.callId ?? ''), name)
      timeline.push({ kind: 'tool', time, tool: name, args: argumentsPreview(data.arguments) })
    } else if (event.type === 'tool/result') {
      const message = data.message
      const callId = String(message?.toolCallId ?? '')
      const name = toolNamesByCall.get(callId) ?? 'tool'
      const text = messageText(message)
      const failed = message?.isError === true || Boolean(data.error) || /\[exit code: [1-9]\d*\]\s*$/.test(text)
      if (!failed) continue
      const signature =
        data.error?.code ??
        (/\[exit code: [1-9]\d*\]\s*$/.test(text) ? 'nonzero-exit' : 'tool-error')
      painCounts.set(signature, (painCounts.get(signature) ?? 0) + 1)
      timeline.push({ kind: 'fail', time, tool: name })
      failures.push({ time, tool: name, signature: String(signature), text: truncate(text, 280) })
    } else if (event.type === 'approval/decided') {
      const outcome = String(data.outcome ?? '')
      if (outcome !== '' && !/^allow/i.test(outcome)) {
        timeline.push({ kind: 'denied', time, text: outcome })
        failures.push({ time, tool: 'approval', signature: 'approval-denied', text: outcome })
      }
    }
  }

  const cwd = typeof session.cwd === 'string' && session.cwd !== '' ? session.cwd : zh ? '（未知）' : '(unknown)'
  const title = typeof session.title === 'string' ? session.title : ''
  const toolSummary = [...toolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => `${name}×${count}`)
    .join('、')

  const header = zh
    ? [
        `会话标题：${title || '（无标题）'}`,
        `工作目录：${cwd}`,
        `时间范围：${clock(session.createdAt, locale)} → ${clock(lastTime, locale)}`,
        `规模：${turns} 回合 / ${steps} 步 / 用户消息 ${requests.length} 条 / 工具调用 ${toolCalls} 次 / 注入上下文 ${injected} 条`,
        `工具分布：${toolSummary || '无'}`,
        `失败签名：${[...painCounts.entries()].map(([key, count]) => `${key}×${count}`).join('、') || '无'}`,
      ].join('\n')
    : [
        `Session title: ${title || '(untitled)'}`,
        `Working directory: ${cwd}`,
        `Time range: ${clock(session.createdAt, locale)} → ${clock(lastTime, locale)}`,
        `Size: ${turns} turns / ${steps} steps / ${requests.length} user messages / ${toolCalls} tool calls / ${injected} injected context messages`,
        `Tools: ${toolSummary || 'none'}`,
        `Failure signatures: ${[...painCounts.entries()].map(([key, count]) => `${key}×${count}`).join(', ') || 'none'}`,
      ].join('\n')

  const requestLines = requests.slice(0, 80).map(
    (entry, index) => `${index + 1}. [${clock(entry.time, locale)}] ${oneLine(entry.text, 300)}`,
  )
  if (requests.length > 80) requestLines.push(zh ? `… 另有 ${requests.length - 80} 条用户消息省略` : `… ${requests.length - 80} more user messages omitted`)

  // Collapse consecutive identical calls so a retry loop reads as "×N".
  const compressed = []
  for (const row of timeline) {
    const key = row.kind === 'tool' ? `tool|${row.tool}|${row.args}` : row.kind === 'fail' ? `fail|${row.tool}` : null
    const previous = compressed[compressed.length - 1]
    if (key && previous && previous.key === key) {
      previous.count += 1
      continue
    }
    compressed.push({
      key,
      count: 1,
      line:
        row.kind === 'user'
          ? zh
            ? `用户：${row.text}`
            : `user: ${row.text}`
          : row.kind === 'tool'
            ? `${row.tool} ${row.args}`
            : row.kind === 'fail'
              ? zh
                ? `${row.tool} → 失败`
                : `${row.tool} → failed`
              : zh
                ? `审批 ${row.text}`
                : `approval ${row.text}`,
    })
  }
  let timelineLines = compressed.map((row, index) =>
    row.count > 1 ? `${index + 1}. ${row.line} ×${row.count}` : `${index + 1}. ${row.line}`,
  )
  const failureLines = failures
    .slice(0, 30)
    .map((entry, index) => `${index + 1}. [${clock(entry.time, locale)}] ${entry.tool} (${entry.signature}) ${oneLine(entry.text, 260)}`)

  const sections = zh
    ? [
        { title: '## 会话概况', lines: header.split('\n') },
        { title: '## 用户消息（按时间）', lines: requestLines },
        { title: '## 工具调用时间线（连续相同调用折叠为 ×N）', lines: timelineLines },
        { title: '## 失败原文', lines: failureLines.length > 0 ? failureLines : ['无'] },
      ]
    : [
        { title: '## Overview', lines: header.split('\n') },
        { title: '## User messages (chronological)', lines: requestLines },
        { title: '## Tool timeline (consecutive identical calls collapsed to ×N)', lines: timelineLines },
        { title: '## Failure texts', lines: failureLines.length > 0 ? failureLines : ['none'] },
      ]

  let text = sections.map((section) => `${section.title}\n${section.lines.join('\n')}`).join('\n\n')
  if (text.length > budget) {
    // Trim the timeline from its middle: the opening intent and the tail
    // (where a loop usually becomes visible) carry the evidence.
    const overflow = text.length - budget
    const maxLines = Math.max(20, timelineLines.length - Math.ceil(overflow / 70) - 10)
    if (timelineLines.length > maxLines) {
      const head = timelineLines.slice(0, Math.ceil(maxLines / 2))
      const tail = timelineLines.slice(-Math.floor(maxLines / 2))
      const omitted = timelineLines.length - head.length - tail.length
      timelineLines = head.concat([zh ? `… 省略 ${omitted} 步 …` : `… ${omitted} steps omitted …`], tail)
      sections[2].lines = timelineLines
      text = sections.map((section) => `${section.title}\n${section.lines.join('\n')}`).join('\n\n')
    }
    if (text.length > budget) text = `${text.slice(0, budget)}\n…`
  }

  return { text, stats: { requests: requests.length, toolCalls, failures: failures.length, turns, steps } }
}
