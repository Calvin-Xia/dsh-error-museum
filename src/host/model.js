/**
 * The configured model, used to audit one Session on demand.
 *
 * "Configured" means the profile's default model selection — the same route the
 * Agent uses — so the user never has to type a provider or a model id here.
 */

import { failure } from './services.js'

const SYSTEM = {
  zh: [
    '你是 DeepSeek Harness 的会话流程审计员。用户会给你一个会话的日志摘要（用户消息、按时间排列的工具调用、失败原文）。',
    '只依据摘要里出现的证据回答，不要补充摘要里没有的步骤、文件或命令。',
    '输出中文 Markdown，严格分成三节，不要前言和后记：',
    '## 冗余流程',
    '- 每条一行：现象 + 重复次数 + 证据位置（例如「工具调用 #12 与 #14」）+ 一句话影响。',
    '## 重复痛点',
    '- 每条一行：症状 + 根因线索 + 出现次数 + 证据位置。',
    '## 改进建议',
    '- 最多 5 条，必须可以直接执行（改提示词、换工具用法、加一步校验等）。',
    '如果某一节确实没有证据，写「没有发现明显问题」。全文不超过 700 字。',
  ].join('\n'),
  en: [
    'You audit one DeepSeek Harness Session. The user gives you a digest of its log: user messages, the tool timeline, and verbatim failure texts.',
    'Use only evidence present in the digest. Never invent steps, files, or commands.',
    'Answer in English Markdown with exactly three sections and nothing before or after them:',
    '## Redundant flow',
    '- One line each: what repeated, how many times, the evidence location (for example "tool call #12 and #14"), and the one-line cost.',
    '## Repeated pain',
    '- One line each: symptom, likely root cause, occurrence count, evidence location.',
    '## Suggested improvements',
    '- At most 5 items, each directly actionable (change the prompt, change tool usage, add a check).',
    'If a section has no evidence, write "No clear issue found". Keep the whole answer under 500 words.',
  ].join('\n'),
}

const MAX_OUTPUT_CHARS = 24_000

/** The profile's default model selection, or null when none is configured. */
export async function readSelection(access) {
  const defaults = access.get('agentDefaultModel')
  if (!defaults || typeof defaults.currentSelection !== 'function') return null
  let selection
  try {
    // The contract is synchronous, but awaiting keeps this correct if an
    // adapter ever resolves the selection asynchronously.
    selection = await defaults.currentSelection()
  } catch {
    return null
  }
  if (!selection || typeof selection.provider !== 'string' || selection.provider === '') return null
  if (typeof selection.model !== 'string' || selection.model === '') return null
  return {
    provider: selection.provider,
    model: selection.model,
    reasoningEffort: typeof selection.reasoningEffort === 'string' ? selection.reasoningEffort : undefined,
  }
}

/** Resolve everything one audit call needs, with a reportable failure per gap. */
export async function prepareModel(access, signal) {
  const llm = access.get('llm')
  if (!llm || typeof llm.stream !== 'function') {
    throw failure('LLM_UNAVAILABLE', 'This profile has no llm service, so no model can run the audit.', 'check_profile')
  }
  const selection = await readSelection(access)
  if (!selection) {
    throw failure(
      'MODEL_NOT_CONFIGURED',
      'No default model is configured for this profile; pick one under Settings > Model first.',
      'configure_model',
    )
  }
  // Model metadata is advisory: a lookup failure must not hide a usable route.
  // The audit then reports the real provider error if the route is broken.
  let info = null
  if (typeof llm.resolveModelInfo === 'function') {
    try {
      info = await llm.resolveModelInfo(selection.provider, selection.model, signal)
    } catch {
      info = null
    }
  }
  // Never forward an effort this model does not advertise.
  const efforts = Array.isArray(info?.reasoning?.efforts) ? info.reasoning.efforts : null
  const reasoningEffort =
    selection.reasoningEffort && (efforts === null || efforts.some((item) => item.id === selection.reasoningEffort))
      ? selection.reasoningEffort
      : undefined
  return {
    llm,
    provider: selection.provider,
    model: selection.model,
    name: typeof info?.name === 'string' && info.name !== '' ? info.name : selection.model,
    resolved: info !== null,
    reasoningEffort,
  }
}

/**
 * Stream one audit. Yields `{ type: 'delta', text }` chunks and returns the
 * final text; a provider failure rejects with a reportable failure.
 */
export async function* auditSession(model, { digest, locale, signal }) {
  const language = locale === 'en' ? 'en' : 'zh'
  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            language === 'zh'
              ? `下面是待审计的会话日志摘要，请按系统提示的三节结构输出。\n\n${digest}`
              : `Here is the Session log digest to audit. Follow the three-section structure from the system prompt.\n\n${digest}`,
        },
      ],
    },
  ]
  const stream = model.llm.stream({
    provider: model.provider,
    model: model.model,
    ...(model.reasoningEffort ? { reasoningEffort: model.reasoningEffort } : {}),
    system: SYSTEM[language],
    messages,
    maxTokens: 4096,
    temperature: 0.2,
    signal,
  })
  let text = ''
  let finished = false
  for await (const chunk of stream) {
    signal?.throwIfAborted?.()
    if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
      text += chunk.text
      if (text.length > MAX_OUTPUT_CHARS) {
        throw failure('OUTPUT_TOO_LONG', 'The model streamed more text than this audit allows.', 'retry')
      }
      yield { type: 'delta', text: chunk.text }
      continue
    }
    if (chunk?.type === 'block-end' && chunk.block?.type === 'text' && typeof chunk.block.text === 'string') {
      // The block-end text is authoritative; replace the accumulated deltas.
      if (chunk.block.text.length > text.length) {
        const tail = chunk.block.text.slice(text.length)
        text = chunk.block.text
        if (tail !== '') yield { type: 'delta', text: tail }
      }
      continue
    }
    if (chunk?.type === 'finish') {
      const kind = chunk.reason?.kind
      if (kind === 'stop' || kind === 'tool-calls') {
        finished = true
        continue
      }
      if (kind === 'aborted') {
        throw failure('AUDIT_ABORTED', 'The audit was cancelled before it finished.', 'retry')
      }
      const detail = chunk.reason?.failure?.message ?? chunk.reason?.error?.message ?? kind ?? 'unknown'
      throw failure('MODEL_FAILED', `The configured model failed during the audit: ${detail}`, 'retry')
    }
  }
  if (!finished) throw failure('MODEL_FAILED', 'The model stream ended without a finish reason.', 'retry')
  return { text, provider: model.provider, model: model.model, modelName: model.name, characters: text.length }
}
