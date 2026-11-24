/**
 * Text helpers shared by the digest, the analysis and the museum.
 *
 * These were duplicated once (each module had its own truncate / preview rule)
 * and the copies drifted; a Session digest, a pain sample and a museum exhibit
 * quote must read the same way, so they live here.
 */

/** Collapse line breaks but keep the paragraph shape of a digest body. */
export function truncate(text, limit) {
  const value = String(text ?? '').replace(/\r\n/g, '\n').trim()
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`
}

/** Collapse every whitespace run, for one-line evidence. */
export function oneLine(text, limit = 400) {
  return truncate(String(text ?? '').replace(/\s+/g, ' '), limit)
}

/** `MM-DD HH:mm` in local time; deterministic across the Host and the probes. */
export function clock(time, locale) {
  if (!Number.isFinite(time)) return '--:--'
  const date = new Date(time)
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Text blocks of one message, joined. Non-text blocks are ignored on purpose. */
export function messageText(message) {
  if (message == null) return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string') out += block.text
  }
  return out
}

/** Reasoning blocks of one assistant message, joined; the model's inner voice. */
export function reasoningText(message) {
  if (message == null || !Array.isArray(message.content)) return ''
  let out = ''
  for (const block of message.content) {
    if (block && block.type === 'reasoning' && typeof block.text === 'string') out += block.text
  }
  return out
}

const ARG_PREFERRED = ['file_path', 'path', 'command', 'description', 'pattern', 'query', 'url', 'prompt', 'name']

/** One-line preview of a tool call's arguments, for a timeline or a plaque. */
export function argumentsPreview(raw, limit = 130) {
  if (typeof raw !== 'string' || raw === '') return ''
  let value
  try {
    value = JSON.parse(raw)
  } catch {
    return oneLine(raw, limit)
  }
  if (!value || typeof value !== 'object') return oneLine(String(value), limit)
  const parts = []
  for (const key of ARG_PREFERRED) {
    if (value[key] === undefined) continue
    const text = typeof value[key] === 'string' ? value[key] : JSON.stringify(value[key])
    if (text) parts.push(key === 'command' ? oneLine(text, Math.floor(limit * 0.76)) : `${key}=${text}`)
  }
  if (parts.length === 0) {
    const keys = Object.keys(value).slice(0, 4)
    for (const key of keys) {
      const text = typeof value[key] === 'string' ? value[key] : JSON.stringify(value[key])
      parts.push(`${key}=${oneLine(text, Math.floor(limit * 0.46))}`)
    }
  }
  return oneLine(parts.join(' '), limit)
}

/**
 * Key-order-independent JSON with depth and length caps, for call comparison.
 * Two calls are "the same" when their argument keys and values are.
 */
export function stableArguments(raw, limit = 220) {
  if (typeof raw !== 'string' || raw === '') return ''
  let value
  try {
    value = JSON.parse(raw)
  } catch {
    return truncate(raw, limit)
  }
  const seen = new Set()
  const walk = (node, depth) => {
    if (node === null || typeof node !== 'object') {
      if (typeof node === 'string') return truncate(node, 160)
      if (node === undefined) return null
      return node
    }
    if (depth > 3) return '[…]'
    if (seen.has(node)) return '[circular]'
    seen.add(node)
    if (Array.isArray(node)) return node.slice(0, 12).map((item) => walk(item, depth + 1))
    const out = {}
    for (const key of Object.keys(node).sort()) out[key] = walk(node[key], depth + 1)
    seen.delete(node)
    return out
  }
  let text
  try {
    text = JSON.stringify(walk(value, 0))
  } catch {
    return truncate(raw, limit)
  }
  return truncate(text ?? '', limit)
}
