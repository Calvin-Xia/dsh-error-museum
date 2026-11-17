/**
 * Failure species: the taxonomy shared by the session board and the museum.
 *
 * A "species" is a stable signature for one kind of failure — plus the one line
 * of advice a reader can act on. The rules are ordered: first match wins, so a
 * specific rule (a sandbox denial) beats a generic one (`Error:`). The museum
 * displays the same species names as the board, so a label is written once.
 */

/** Canonical pain signatures. First match wins, so keep specific rules on top. */
export const PAIN_RULES = [
  {
    id: 'fs-stale-version',
    re: /file changed since it was read|FS_STALE_VERSION/i,
    advice: {
      zh: '编辑前先重新读取文件；长会话里文件被外部改写很常见。',
      en: 'Re-read before editing; long Sessions let files change underneath you.',
    },
  },
  {
    id: 'fs-not-observed',
    re: /has not been read|FS_NOT_OBSERVED/i,
    advice: {
      zh: '写入或编辑前必须先用 read 观察目标文件。',
      en: 'Observe the target with read before writing or editing it.',
    },
  },
  {
    id: 'sandbox-denied',
    re: /\[sandbox: file access denied|access_denied|permission denied for|EACCES|EPERM/i,
    advice: {
      zh: '路径落在沙箱白名单外；先确认工作目录，或一次性升级权限后重跑。',
      en: 'The path is outside the sandbox allowlist; confirm the working directory or escalate once.',
    },
  },
  {
    id: 'auto-review-denied',
    re: /auto[ -]review (?:rejected|denied) tool/i,
    advice: {
      zh: '自动评审拦下的是危险操作；改成分步、只读或更小范围的动作，而不是重发同一命令。',
      en: 'Auto review blocked a destructive action; split it, make it read-only, or narrow it instead of resending it.',
    },
  },
  {
    id: 'auto-review-failed',
    re: /auto[ -]review of tool .{0,40} failed|auto-review: reviewer ended with error/i,
    advice: {
      zh: '自动评审自身故障（常见 503）；这是基础设施问题，等一下再试，别改进代码。',
      en: 'The auto reviewer itself failed (often a 503); wait and retry rather than changing the code.',
    },
  },
  {
    id: 'approval-denied',
    re: /approval (?:was )?(?:denied|cancelled|timed out)|the user rejected tool|\[code\] access_(?:denied|timeout)/i,
    advice: {
      zh: '用户拒绝或超时的审批不要重试；换一种不需要提权的做法。',
      en: 'Never retry a denied or timed-out approval; find a path that needs no escalation.',
    },
  },
  {
    id: 'shell-start-failed',
    re: /PTY shell exited during startup|shell exited during startup/i,
    advice: {
      zh: '终端进程没起来；先确认 shell 可执行文件与运行环境，再重开会话。',
      en: 'The terminal process never started; check the shell executable and runtime before reopening.',
    },
  },
  {
    id: 'edit-noop',
    re: /old_string and new_string must differ/i,
    advice: {
      zh: '编辑内容与原文相同；这次改动是空操作，确认目标后再写。',
      en: 'The edit was a no-op because it matched the current text; confirm the target before writing.',
    },
  },
  {
    id: 'read-out-of-range',
    re: /offset \d+ is out of range/i,
    advice: {
      zh: '读取偏移超出文件长度；先看行数，再从文件内取偏移。',
      en: 'The read offset is past the end of the file; check its line count first.',
    },
  },
  {
    id: 'path-not-found',
    re: /No such file or directory|cannot find (?:the )?path|找不到路径|系统找不到指定的路径/i,
    advice: {
      zh: '先用 glob 或列目录确认路径存在，再执行依赖它的命令。',
      en: 'Confirm the path with glob or a directory listing before using it.',
    },
  },
  {
    id: 'command-not-found',
    re: /command not found|not recognized as (?:the )?name|不是内部或外部命令/i,
    advice: {
      zh: '命令不在 PATH 中；先探测可执行文件，或改用已确认存在的入口。',
      en: 'The executable is not on PATH; probe for it or use a verified entry point.',
    },
  },
  {
    id: 'timeout',
    re: /timed? ?out|ETIMEDOUT|access_timeout|took too long/i,
    // stderr-shaped signals: in stdout the same words are usually just data.
    where: 'tail',
    advice: {
      zh: '拆小命令或加大超时；长任务改用后台作业。',
      en: 'Split the command or raise the timeout; move long work to a background job.',
    },
  },
  {
    id: 'transport-error',
    re: /TRANSPORT|ECONNRESET|ECONNREFUSED|connection error|network error|getaddrinfo/i,
    where: 'tail',
    advice: {
      zh: '网络或模型传输失败；重试一次即可，连续失败就换通道。',
      en: 'Transport failure; retry once, then switch channel.',
    },
  },
  {
    id: 'edit-no-match',
    re: /String to replace not found|old_string.{0,40}not found|text to replace .{0,40}not found|edit failed/i,
    advice: {
      zh: '编辑锚点已失效；按当前文件内容重新取一段上下文再改。',
      en: 'The edit anchor is stale; take a fresh snippet and retry.',
    },
  },
  {
    id: 'nonzero-exit',
    re: /\[exit code: [1-9]\d*\]\s*$/,
    where: 'tail',
    advice: {
      zh: '命令非零退出；先读 stderr 定位原因，再改命令而不是原样重跑。',
      en: 'Non-zero exit; read stderr before changing or repeating the command.',
    },
  },
  {
    id: 'tool-error',
    re: /^Error:/,
    advice: {
      zh: '工具直接报错；换参数或换工具，别重复同一调用。',
      en: 'The tool failed outright; change the call, do not repeat it.',
    },
  },
]

/** User-side friction markers. Reported as user signals, separate from tool failures. */
export const USER_SIGNALS = [
  {
    id: 'user-retry',
    re: /(还是|仍然|依然|又)(不行|没|失败|报错|卡)|再试|重试|不好使|没反应|卡住|怎么还/i,
    advice: {
      zh: '用户在反复要求重试，说明上一轮没有把失败原因讲清楚。',
      en: 'The user keeps asking for a retry; the previous failure was not explained.',
    },
  },
  {
    id: 'user-correction',
    re: /(不对|不是这样|错了|我要的是|我说的是|重做|重新做|改一下|理解错)/,
    advice: {
      zh: '需求到后续回合才被纠正，说明首轮没有先确认目标。',
      en: 'The request was corrected later; confirm the goal before acting.',
    },
  },
  {
    id: 'user-error-report',
    re: /(报错|异常|崩溃|闪退|跑不起来|启动失败)/,
    advice: {
      zh: '用户报出的错误应先复现并保留原始输出，再动代码。',
      en: 'Reproduce the reported error and capture the raw output before changing code.',
    },
  },
]

/** Display names live here so the page, tools and reports use the same words. */
export const PAIN_LABELS = {
  'fs-stale-version': { zh: '文件在读取后发生变化', en: 'File changed after it was read' },
  'fs-not-observed': { zh: '未读取就写入', en: 'Write before read' },
  'sandbox-denied': { zh: '沙箱拒绝访问', en: 'Sandbox denied access' },
  'approval-denied': { zh: '审批被拒绝或超时', en: 'Approval denied or timed out' },
  'auto-review-denied': { zh: '自动评审拦下操作', en: 'Auto review blocked the call' },
  'auto-review-failed': { zh: '自动评审自身故障', en: 'Auto review failed on its own' },
  'shell-start-failed': { zh: '终端启动失败', en: 'Terminal failed to start' },
  'edit-noop': { zh: '空编辑', en: 'Edit was a no-op' },
  'read-out-of-range': { zh: '读取越界', en: 'Read offset out of range' },
  'path-not-found': { zh: '路径不存在', en: 'Path not found' },
  'command-not-found': { zh: '命令不可用', en: 'Command not found' },
  timeout: { zh: '执行超时', en: 'Execution timed out' },
  'transport-error': { zh: '传输或网络失败', en: 'Transport or network failure' },
  'edit-no-match': { zh: '编辑锚点失效', en: 'Edit anchor no longer matches' },
  'nonzero-exit': { zh: '命令非零退出', en: 'Command exited non-zero' },
  'tool-error': { zh: '工具直接报错', en: 'Tool returned an error' },
  'turn-aborted': { zh: '回合被中断', en: 'Turn aborted' },
  'turn-error': { zh: '回合异常结束', en: 'Turn ended with an error' },
  'turn-max-tokens': { zh: '回合耗尽输出预算', en: 'Turn hit the output budget' },
  'user-retry': { zh: '用户反复要求重试', en: 'User asked to retry repeatedly' },
  'user-correction': { zh: '需求在后续回合被纠正', en: 'Request corrected on a later turn' },
  'user-error-report': { zh: '用户报告报错', en: 'User reported a failure' },
}

export const EXIT_MARKER = /\[exit code: ([1-9]\d*)\]\s*$/

export function painLabel(id, locale) {
  const known = PAIN_LABELS[id]
  if (known) return known[locale] ?? known.en
  if (id.startsWith('code:')) {
    const code = id.slice(5)
    return locale === 'zh' ? `工具错误码 ${code}` : `Tool error ${code}`
  }
  return id
}

export function painAdvice(id, locale) {
  const rule = PAIN_RULES.find((item) => item.id === id) ?? USER_SIGNALS.find((item) => item.id === id)
  if (!rule?.advice) return ''
  return rule.advice[locale] ?? rule.advice.en
}

export function painKind(id) {
  if (id.startsWith('user-')) return 'user'
  if (id.startsWith('turn-')) return 'turn'
  if (id === 'approval-denied' || id.startsWith('auto-review')) return 'approval'
  return 'tool'
}

/** Match one failure text to the most specific species; `where` scopes the scan. */
export function matchPain(text, toolName) {
  if (!text) return null
  // Command failures announce themselves at the very end of the result, and
  // shell output may legitimately contain the same marker text in the middle.
  const head = text.length > 1400 ? text.slice(0, 1400) : text
  const tail = text.length > 1400 ? text.slice(-800) : text
  for (const rule of PAIN_RULES) {
    const scope = rule.where === 'tail' ? tail : head
    if (rule.re.test(scope)) return rule
  }
  return null
}

/**
 * Species of one authoritative failure.
 *
 * The caller only passes results it already knows failed (tool marked it, the
 * event carried an error, or the shell ended non-zero), so a fallback species
 * is always chosen and no successful output is ever keyword-scanned.
 */
export function failureSpecies({ text, tool, isError, errorCode, exitCode }) {
  const rule = matchPain(text, tool)
  if (rule) return rule.id
  if (errorCode) return `code:${errorCode}`
  if (isError) return 'tool-error'
  if (exitCode > 0) return 'nonzero-exit'
  return 'tool-error'
}

export const PAIN_SIGNATURE_IDS = PAIN_RULES.map((rule) => rule.id).concat(USER_SIGNALS.map((rule) => rule.id))
