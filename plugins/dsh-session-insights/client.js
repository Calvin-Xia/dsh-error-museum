// Browser half of dsh-session-insights.
//
// Loaded by the Web app's module loader; the Host half serves the JSON this page
// reads. One left-rail entry → one page: a Session board plus one Session's
// evidence, and an on-demand audit by the profile's configured default model.
window.__ModuleLoader__.load({
  id: 'dsh-session-insights',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } = React

    const NS = 'dsh-session-insights'
    const API = '/dsh-session-insights/api'
    const RANGES = [7, 30, 90]
    const BOARD_LIMIT = 40

    // ---------------------------------------------------------------- strings
    const DICT = {
      zh: {
        'panel.title': '错误博物馆',
        'page.subtitle': '近 {days} 天 {sessions} 个会话 · {calls} 次工具调用 · 失败 {failureRate} · 冗余 {redundancyRate}',
        'page.cache': '摘要缓存：复用 {reused} · 新读 {read} · 用时 {ms} ms',
        'range.label': '统计范围',
        'range.days': '{n} 天',
        'action.refresh': '刷新',
        'action.back': '返回看板',
        'action.audit': '用模型深挖',
        'action.stop': '停止',
        'action.retry': '重试',
        'action.more': '再显示 {n} 个',
        'loading': '正在读取会话日志…',
        'loading.hint': '首次读取整个时间窗口需要几秒。',
        'error.title': '读取失败',
        'kpi.sessions': '会话',
        'kpi.active': '有内容',
        'kpi.calls': '工具调用',
        'kpi.failures': '失败调用',
        'kpi.failureRate': '失败率',
        'kpi.redundant': '冗余调用',
        'kpi.redundancyRate': '冗余率',
        'kpi.requests': '用户需求',
        'kpi.perRequest': '每次需求调用',
        'kpi.aborted': '中断回合',
        'pains.title': '重复痛点',
        'pains.hint': '跨会话反复出现的失败与摩擦，按涉及会话数排序。',
        'pains.empty': '这个窗口里没有出现明显痛点。',
        'pains.meta': '{count} 次 · {sessions} 个会话',
        'flows.title': '冗余流程',
        'flows.hint': '同一调用、同一工具序列、同一需求被重复。',
        'flows.empty': '没有发现明显的重复流程。',
        'flows.meta': '{repeats} 次重复 · {sessions} 个会话',
        'flow.duplicate-call': '重复调用',
        'flow.sequence': '重复序列',
        'flow.repeat-prompt': '重复需求',
        'board.title': '会话看板',
        'board.hint': '全部会话按风险分列。点开卡片看证据，再用已配置模型深挖。',
        'board.model': '分析模型',
        'board.modelMissing': '未配置默认模型',
        'board.pain': '高痛点',
        'board.redundant': '有冗余',
        'board.ok': '平稳',
        'board.empty': '没有会话',
        'card.untitled': '未命名会话',
        'card.requests': '{n} 需求',
        'card.calls': '{n} 调用',
        'card.fails': '{n} 失败',
        'card.redundant': '{n} 冗余',
        'detail.metrics': '关键指标',
        'detail.pains': '痛点证据',
        'detail.duplicates': '重复调用',
        'detail.tools': '工具分布',
        'detail.requests': '用户需求',
        'detail.exhibits': '本会话的错误展品',
        'detail.exhibits.hint': '失败发生在这一刻；点开回到展签看前后轨迹。',
        'detail.exhibits.empty': '这个会话里没有可展出的失败。',
        'detail.audit': '模型分析',
        'detail.audit.idle': '还没有分析。点「用模型深挖」，用当前配置的默认模型读完这个会话再给结论。',
        'detail.audit.running': '模型正在读这个会话…',
        'detail.audit.input': '输入摘要：{requests} 条需求 / {calls} 次调用 / {failures} 处失败',
        'detail.audit.by': '由 {model} 生成',
        'detail.audit.saved': '已保存 · {time}',
        'detail.audit.saveFailed': '结果未能保存：{message}',
        'detail.noPains': '这个会话没有明显的痛点签名。',
        'detail.noDuplicates': '没有重复调用。',
        'detail.noTools': '没有工具调用。',
        'detail.empty': '这个会话没有可展示的内容。',
        'metric.turns': '回合',
        'metric.steps': '步骤',
        'metric.calls': '工具调用',
        'metric.fails': '失败',
        'metric.redundant': '冗余调用',
        'metric.rereads': '重复读取',
        'metric.requests': '用户需求',
        'metric.injected': '注入上下文',
        'metric.denied': '审批被拒',
        'metric.count': '次数',
        'time.justNow': '刚刚',
        'time.minAgo': '{n} 分钟前',
        'time.hourAgo': '{n} 小时前',
        'time.dayAgo': '{n} 天前',
        'kind.tool': '工具',
        'kind.user': '用户',
        'kind.turn': '回合',
        'kind.approval': '审批',
        'view.museum': '展厅',
        'view.sessions': '会话',
        'museum.latin': 'THE ERROR MUSEUM',
        'museum.subtitle': '近 {days} 天收录 {exhibits} 件 · {sessions} 个会话 · 复原 {recovery} · 自省 {reflection}',
        'museum.tagline': '每一件失败都带着前因与后果；这里保存模型面对错误时的真实处置。',
        'museum.kpi.exhibits': '馆藏',
        'museum.kpi.exhibits.foot': '{sessions} 个会话 · 近 7 天 +{recent}',
        'museum.kpi.recovery': '复原率',
        'museum.kpi.recovery.foot': '{fixed} 件回到正轨',
        'museum.kpi.reflection': '自省率',
        'museum.kpi.reflection.foot': '{selfCorrect} 件明确认错',
        'museum.kpi.verbatim': '原样重试',
        'museum.kpi.verbatim.foot': '{repeated} 件再次入馆',
        'museum.kpi.refused': '被拒绝',
        'museum.kpi.refused.foot': '{handback} 件交还用户',
        'museum.kpi.steps': '平均复原步数',
        'museum.kpi.steps.foot': '{pending} 件未定论',
        'museum.species.title': '藏品类型',
        'museum.species.hint': '按藏品数量排列；点一类只看它。',
        'museum.species.all': '全部',
        'museum.species.meta': '{count} 件 · {sessions} 个会话 · 复原 {fixed}',
        'museum.daily.title': '入藏曲线',
        'museum.daily.hint': '每天新增的藏品数量；只统计可确认的失败。',
        'museum.daily.peak': '峰值 {date} · {count} 件',
        'museum.daily.week': '近 7 天 +{count}',
        'museum.daily.empty': '这个窗口里没有藏品。',
        'museum.daily.bar': '{date}：{count} 件',
        'museum.filter.reflect': '只看自省',
        'museum.filter.reset': '清除筛选',
        'museum.filter.result': '筛选出 {n} 件',
        'museum.board.title': '展厅',
        'museum.board.shown': '陈列 {shown} / 馆藏 {total} 件',
        'museum.board.hint': '按失败之后的处置分室陈列；点开一件看前因、故障与后果。',
        'museum.notes.title': '策展人按',
        'museum.notes.hint': '只根据本期展品的统计写成，不做语义猜测。',
        'museum.hall.restored': '复原室',
        'museum.hall.restored.hint': '换参数、换工具，或自省之后改道。',
        'museum.hall.retried': '重试室',
        'museum.hall.retried.hint': '同一动作被再次执行，或同一错误再次出现。',
        'museum.hall.handback': '交还室',
        'museum.hall.handback.hint': '模型说明情况，把决定交回用户。',
        'museum.hall.stalled': '搁置室',
        'museum.hall.stalled.hint': '没有后续动作，或回合异常结束。',
        'museum.hall.empty': '这一室暂时空着。',
        'museum.no': 'No. {no}',
        'museum.card.retried': '原样重试 ×{n}',
        'museum.card.reflected': '自省',
        'museum.card.repeated': '再次入馆',
        'museum.card.refused': '用户拒绝',
        'museum.card.turn': '第 {n} 回合',
        'museum.card.open': '查看展签',
        'museum.more': '再陈列 {n} 件',
        'museum.empty': '本馆暂未入藏。',
        'museum.empty.hint': '这个时间窗里没有可展出的失败；换个范围，或点「刷新」重新收录。',
        'museum.loading': '正在布展…',
        'museum.detail.back': '返回展厅',
        'museum.detail.session': '打开出处会话',
        'museum.detail.artifact': '故障实物',
        'museum.detail.meta': '处置判定',
        'museum.detail.outcome': '结局',
        'museum.detail.tool': '工具',
        'museum.detail.steps': '复原步数',
        'museum.detail.retries': '原样重试',
        'museum.detail.turn': '回合',
        'museum.detail.before': '前因',
        'museum.detail.after': '后果',
        'museum.detail.reaction': '现场反应',
        'museum.detail.noReaction': '这一步没有留下模型文字，只有下一次调用。',
        'museum.detail.advice': '处置建议',
        'museum.detail.note': '策展人按',
        'museum.detail.step.ok': '成功',
        'museum.detail.step.fail': '失败',
        'museum.detail.step.unknown': '结果未记录',
        'museum.detail.reflection': '模型写道',
        'museum.detail.before.empty': '没有更早的调用记录。',
        'museum.detail.after.empty': '这之后没有可追踪的调用。',
        'museum.detail.missing': '这件展品不在当前报告里，可能已被新一轮收录替换。',
        'museum.verdict.retried-verbatim': '原样重试',
        'museum.verdict.retried-adjusted': '改参数重试',
        'museum.verdict.switched-tool': '换用其他工具',
        'museum.verdict.handback': '交还用户',
        'museum.verdict.none': '无明确处置',
        'museum.outcome.fixed': '已复原',
        'museum.outcome.repeated': '反复失败',
        'museum.outcome.handback': '交还',
        'museum.outcome.stalled': '搁置',
        'museum.outcome.pending': '未定论',
        'museum.reflect.self-correct': '认错',
        'museum.reflect.replan': '改道',
        'museum.reflect.acknowledge': '承认',
        'museum.reflect.none': '无',
        'museum.note.retried-verbatim': '失败后，模型原样重发了同一个调用 {n} 次，参数没有变化。',
        'museum.note.retried-adjusted': '失败后模型继续用 {tool}，但换了参数{fixed}。',
        'museum.note.switched-tool': '失败后模型换用其他工具{fixed}。',
        'museum.note.handback': '模型停在这里，用文字说明情况，把下一步交回用户。',
        'museum.note.none': '这一步之后没有可追踪的后续动作。',
        'museum.note.fixed': '，第 {n} 次调用成功',
        'museum.note.notFixed': '，但没有一次调用成功',
        'museum.note.reflected': '现场写道：「{quote}」',
        'museum.note.refused': '这是一次被用户拒绝的审批；再发同样的操作只会再次被拦。',
        'museum.note.repeated': '同一错误在随后 {n} 次调用里再次出现。',
      },
      en: {
        'panel.title': 'The Error Museum',
        'page.subtitle': 'Last {days} days: {sessions} Sessions · {calls} tool calls · {failureRate} failed · {redundancyRate} redundant',
        'page.cache': 'Digest cache: {reused} reused · {read} read · {ms} ms',
        'range.label': 'Range',
        'range.days': '{n} days',
        'action.refresh': 'Refresh',
        'action.back': 'Back to board',
        'action.audit': 'Audit with model',
        'action.stop': 'Stop',
        'action.retry': 'Retry',
        'action.more': 'Show {n} more',
        'loading': 'Reading Session logs…',
        'loading.hint': 'The first read of the whole window takes a few seconds.',
        'error.title': 'Could not read',
        'kpi.sessions': 'Sessions',
        'kpi.active': 'With content',
        'kpi.calls': 'Tool calls',
        'kpi.failures': 'Failed calls',
        'kpi.failureRate': 'Failure rate',
        'kpi.redundant': 'Redundant calls',
        'kpi.redundancyRate': 'Redundancy rate',
        'kpi.requests': 'User requests',
        'kpi.perRequest': 'Calls per request',
        'kpi.aborted': 'Aborted turns',
        'pains.title': 'Repeated pain',
        'pains.hint': 'Failures and friction that recur across Sessions, ranked by Sessions affected.',
        'pains.empty': 'No clear pain in this window.',
        'pains.meta': '{count} times · {sessions} Sessions',
        'flows.title': 'Redundant flow',
        'flows.hint': 'The same call, the same tool sequence, the same request asked again.',
        'flows.empty': 'No obvious repeated flow.',
        'flows.meta': '{repeats} repeats · {sessions} Sessions',
        'flow.duplicate-call': 'Repeated call',
        'flow.sequence': 'Repeated sequence',
        'flow.repeat-prompt': 'Repeated request',
        'board.title': 'Session board',
        'board.hint': 'Every Session, grouped by risk. Open a card for the evidence, then audit it with the configured model.',
        'board.model': 'Audit model',
        'board.modelMissing': 'No default model configured',
        'board.pain': 'Pain-heavy',
        'board.redundant': 'Redundant',
        'board.ok': 'Calm',
        'board.empty': 'No Sessions',
        'card.untitled': 'Untitled Session',
        'card.requests': '{n} requests',
        'card.calls': '{n} calls',
        'card.fails': '{n} failed',
        'card.redundant': '{n} redundant',
        'detail.metrics': 'Metrics',
        'detail.pains': 'Pain evidence',
        'detail.duplicates': 'Duplicate calls',
        'detail.tools': 'Tool usage',
        'detail.requests': 'User requests',
        'detail.exhibits': 'Exhibits from this Session',
        'detail.exhibits.hint': 'Where the failures happened; open one for its before and after.',
        'detail.exhibits.empty': 'No exhibit-worthy failure in this Session.',
        'detail.audit': 'Model audit',
        'detail.audit.idle': 'Not audited yet. Use "Audit with model" to have the configured default model read this Session and report back.',
        'detail.audit.running': 'The model is reading this Session…',
        'detail.audit.input': 'Input digest: {requests} requests / {calls} calls / {failures} failures',
        'detail.audit.by': 'Generated by {model}',
        'detail.audit.saved': 'Saved · {time}',
        'detail.audit.saveFailed': 'Not saved: {message}',
        'detail.noPains': 'No clear pain signature in this Session.',
        'detail.noDuplicates': 'No duplicate calls.',
        'detail.noTools': 'No tool calls.',
        'detail.empty': 'This Session has nothing to show.',
        'metric.turns': 'Turns',
        'metric.steps': 'Steps',
        'metric.calls': 'Tool calls',
        'metric.fails': 'Failed',
        'metric.redundant': 'Redundant',
        'metric.rereads': 'Repeated reads',
        'metric.requests': 'User requests',
        'metric.injected': 'Injected context',
        'metric.denied': 'Denied approvals',
        'metric.count': 'Count',
        'time.justNow': 'just now',
        'time.minAgo': '{n} min ago',
        'time.hourAgo': '{n} h ago',
        'time.dayAgo': '{n} d ago',
        'kind.tool': 'tool',
        'kind.user': 'user',
        'kind.turn': 'turn',
        'kind.approval': 'approval',
        'view.museum': 'Gallery',
        'view.sessions': 'Sessions',
        'museum.latin': 'THE ERROR MUSEUM',
        'museum.subtitle': 'Last {days} days: {exhibits} exhibits · {sessions} Sessions · {recovery} recovered · {reflection} self-corrected',
        'museum.tagline': 'Every failure arrives with a before and an after; this is where the model’s actual handling is kept.',
        'museum.kpi.exhibits': 'Collection',
        'museum.kpi.exhibits.foot': '{sessions} Sessions · +{recent} in 7 days',
        'museum.kpi.recovery': 'Recovered',
        'museum.kpi.recovery.foot': '{fixed} back on track',
        'museum.kpi.reflection': 'Self-corrected',
        'museum.kpi.reflection.foot': '{selfCorrect} named the mistake',
        'museum.kpi.verbatim': 'Verbatim retries',
        'museum.kpi.verbatim.foot': '{repeated} came back with the same error',
        'museum.kpi.refused': 'Refused',
        'museum.kpi.refused.foot': '{handback} handed back',
        'museum.kpi.steps': 'Calls to recover',
        'museum.kpi.steps.foot': '{pending} still undecided',
        'museum.species.title': 'Species',
        'museum.species.hint': 'Ordered by exhibit count; pick one to see only that species.',
        'museum.species.all': 'All',
        'museum.species.meta': '{count} pieces · {sessions} Sessions · {fixed} recovered',
        'museum.daily.title': 'Accessions by day',
        'museum.daily.hint': 'New exhibits per day; confirmed failures only.',
        'museum.daily.peak': 'Peak {date} · {count}',
        'museum.daily.week': '+{count} in 7 days',
        'museum.daily.empty': 'No exhibits in this window.',
        'museum.daily.bar': '{date}: {count}',
        'museum.filter.reflect': 'Self-corrected only',
        'museum.filter.reset': 'Clear filter',
        'museum.filter.result': '{n} exhibits match',
        'museum.board.title': 'Halls',
        'museum.board.shown': '{shown} of {total} exhibits hung',
        'museum.board.hint': 'Hung by how the failure was handled; open a piece for its before, fault and after.',
        'museum.notes.title': 'Curator’s notes',
        'museum.notes.hint': 'Written from this window’s exhibits only, with no semantic guessing.',
        'museum.hall.restored': 'Restoration',
        'museum.hall.restored.hint': 'Arguments or tools changed, or a stated correction.',
        'museum.hall.retried': 'Retries',
        'museum.hall.retried.hint': 'The same action ran again, or the same error returned.',
        'museum.hall.handback': 'Handed back',
        'museum.hall.handback.hint': 'The model explained and returned the decision to the user.',
        'museum.hall.stalled': 'Stalled',
        'museum.hall.stalled.hint': 'No follow-up, or the turn ended abnormally.',
        'museum.hall.empty': 'This hall is empty.',
        'museum.no': 'No. {no}',
        'museum.card.retried': 'Verbatim retry ×{n}',
        'museum.card.reflected': 'Self-corrected',
        'museum.card.repeated': 'Same error again',
        'museum.card.refused': 'User refused',
        'museum.card.turn': 'Turn {n}',
        'museum.card.open': 'Open the label',
        'museum.more': 'Hang {n} more',
        'museum.empty': 'Nothing has been accessioned yet.',
        'museum.empty.hint': 'No failure in this window can be exhibited; change the range or refresh the collection.',
        'museum.loading': 'Preparing the gallery…',
        'museum.detail.back': 'Back to the gallery',
        'museum.detail.session': 'Open source Session',
        'museum.detail.artifact': 'The artifact',
        'museum.detail.meta': 'Handling',
        'museum.detail.outcome': 'Outcome',
        'museum.detail.tool': 'Tool',
        'museum.detail.steps': 'Calls to recover',
        'museum.detail.retries': 'Verbatim retries',
        'museum.detail.turn': 'Turn',
        'museum.detail.before': 'Before',
        'museum.detail.after': 'After',
        'museum.detail.reaction': 'On the spot',
        'museum.detail.noReaction': 'This step left no words, only the next call.',
        'museum.detail.advice': 'Advice',
        'museum.detail.note': 'Curator’s note',
        'museum.detail.step.ok': 'ok',
        'museum.detail.step.fail': 'failed',
        'museum.detail.step.unknown': 'result not recorded',
        'museum.detail.reflection': 'The model wrote',
        'museum.detail.before.empty': 'No earlier calls recorded.',
        'museum.detail.after.empty': 'Nothing traceable followed.',
        'museum.detail.missing': 'This exhibit is not in the current report; a newer accession replaced it.',
        'museum.verdict.retried-verbatim': 'Verbatim retry',
        'museum.verdict.retried-adjusted': 'Retry with new arguments',
        'museum.verdict.switched-tool': 'Switched tool',
        'museum.verdict.handback': 'Handed back',
        'museum.verdict.none': 'No clear handling',
        'museum.outcome.fixed': 'Recovered',
        'museum.outcome.repeated': 'Failed again',
        'museum.outcome.handback': 'Handed back',
        'museum.outcome.stalled': 'Stalled',
        'museum.outcome.pending': 'Undecided',
        'museum.reflect.self-correct': 'Owned it',
        'museum.reflect.replan': 'Changed plan',
        'museum.reflect.acknowledge': 'Acknowledged',
        'museum.reflect.none': 'None',
        'museum.note.retried-verbatim': 'After failing, the model sent the identical call {n} more time(s) with unchanged arguments.',
        'museum.note.retried-adjusted': 'After failing, the model stayed with {tool} but changed the arguments{fixed}.',
        'museum.note.switched-tool': 'After failing, the model switched to another tool{fixed}.',
        'museum.note.handback': 'The model stopped here, explained, and left the next decision to the user.',
        'museum.note.none': 'Nothing traceable followed this step.',
        'museum.note.fixed': ', and call {n} succeeded',
        'museum.note.notFixed': ', and no later call succeeded',
        'museum.note.reflected': ' On the spot it wrote: “{quote}”',
        'museum.note.refused': 'This was a refused approval; resending the same operation only hits the same wall.',
        'museum.note.repeated': 'The same error returned in {n} of the following calls.',
      },
    }

    // ------------------------------------------------------------------ state
    let appCtx = null
    let translate = (key, vars) => format(DICT.zh[key] ?? key, vars)

    function format(text, vars) {
      if (!vars) return text
      return String(text).replace(/\{(\w+)\}/g, (match, key) => (vars[key] === undefined ? match : String(vars[key])))
    }

    function activeLocale() {
      try {
        const id = appCtx?.locale?.getLocale?.()?.active ?? 'zh'
        return String(id).toLowerCase().startsWith('en') ? 'en' : 'zh'
      } catch {
        return 'zh'
      }
    }

    function useActiveLocale() {
      const subscribe = useCallback((onChange) => {
        try {
          return appCtx?.locale?.subscribe?.(onChange) ?? (() => {})
        } catch {
          return () => {}
        }
      }, [])
      const getSnapshot = useCallback(() => {
        try {
          return String(appCtx?.locale?.getSnapshot?.()?.active ?? 'zh')
        } catch {
          return 'zh'
        }
      }, [])
      return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    }

    // --------------------------------------------------------------- helpers
    const integerFormat = (locale) => {
      try {
        return new Intl.NumberFormat(locale === 'en' ? 'en' : 'zh-CN')
      } catch {
        return null
      }
    }

    function num(value, locale) {
      const formatter = integerFormat(locale)
      const number = Number(value)
      if (!Number.isFinite(number)) return '0'
      return formatter ? formatter.format(number) : String(number)
    }

    function pct(value) {
      const number = Number(value)
      if (!Number.isFinite(number)) return '0%'
      return `${(number * 100).toFixed(number > 0 && number < 0.01 ? 2 : 1)}%`
    }

    // ------------------------------------------------------------- ui state
    // The `main` slot renders one panel at a time, so this page unmounts when
    // the user opens the conversation or another panel. Its own place — the
    // range, the open Session, how far each board column is expanded — is a
    // view preference, so it lives in browser storage and is restored on the
    // next mount instead of jumping back to the board.
    const UI_KEY = 'dsh-session-insights.ui.v1'

    function readUiState() {
      try {
        const raw = window.localStorage?.getItem(UI_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    }

    function writeUiState(patch) {
      try {
        const next = { ...readUiState(), ...patch }
        window.localStorage?.setItem(UI_KEY, JSON.stringify(next))
      } catch {
        /* blocked or full storage must not break the page */
      }
    }

    function relativeTime(ts, t) {
      const time = Number(ts)
      if (!Number.isFinite(time) || time <= 0) return ''
      const diff = Date.now() - time
      const minute = 60_000
      if (diff < minute) return t('time.justNow')
      if (diff < 60 * minute) return format(t('time.minAgo'), { n: Math.round(diff / minute) })
      if (diff < 24 * 60 * minute) return format(t('time.hourAgo'), { n: Math.round(diff / (60 * minute)) })
      return format(t('time.dayAgo'), { n: Math.round(diff / (24 * 60 * minute)) })
    }

    function dateTime(ts, locale) {
      const time = Number(ts)
      if (!Number.isFinite(time) || time <= 0) return ''
      try {
        return new Date(time).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      } catch {
        return new Date(time).toISOString()
      }
    }

    function basename(path) {
      if (typeof path !== 'string' || path === '') return ''
      const parts = path.split(/[\\/]+/).filter((part) => part !== '')
      return parts.length === 0 ? path : parts[parts.length - 1]
    }

    async function readJsonResponse(response) {
      // A plain `response.json()` reports a browser engine message on an empty
      // or HTML body, which hides the real cause (for example a missing route).
      const text = await response.text()
      const status = `HTTP ${response.status}`
      if (text.trim() === '') throw Object.assign(new Error(`empty response body (${status})`), { code: 'EMPTY_RESPONSE' })
      try {
        return JSON.parse(text)
      } catch {
        throw Object.assign(new Error(`non-JSON response (${status}), is the plugin's Host half active?`), { code: 'NON_JSON_RESPONSE' })
      }
    }

    async function readNdjson(response, onLine) {
      const reader = response.body?.getReader?.()
      if (!reader) throw new Error('response has no body')
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let index = buffer.indexOf('\n')
        while (index >= 0) {
          const line = buffer.slice(0, index).trim()
          buffer = buffer.slice(index + 1)
          if (line !== '') onLine(JSON.parse(line))
          index = buffer.indexOf('\n')
        }
      }
      const tail = buffer.trim()
      if (tail !== '') onLine(JSON.parse(tail))
    }

    // ------------------------------------------------------------------ icons
    function InsightsIcon({ size = 18 }) {
      const edge = size === undefined || size === null ? 18 : size
      return h(
        'svg',
        { viewBox: '0 0 64 64', width: edge, height: edge, 'aria-hidden': true, style: { display: 'block' } },
        h(
          'g',
          { fill: 'none', stroke: 'currentColor', strokeWidth: 3.2, strokeLinejoin: 'round', strokeLinecap: 'round' },
          h('path', { d: 'M8 23 32 8l24 15' }),
          h('path', { d: 'M11 23h42' }),
          h('path', { d: 'M17 28v19M27 28v19M37 28v19M47 28v19' }),
          h('path', { d: 'M11 52h42' }),
          h('circle', { cx: 32, cy: 17, r: 2.2, fill: 'currentColor', stroke: 'none' }),
        ),
      )
    }

    // ------------------------------------------------------------------- css
    const CSS = `
.si-root{height:100%;min-height:0;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55}
.si-root *{box-sizing:border-box}
.si-wrap{max-width:1220px;margin:0 auto;padding:22px 24px 56px;display:flex;flex-direction:column;gap:16px}
.si-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.si-title{margin:0;font-size:19px;font-weight:650;letter-spacing:.01em}
.si-sub{margin:5px 0 0;color:var(--dsw-alias-label-secondary);font-size:12.5px}
.si-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.si-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.si-seg button{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:5px 11px;cursor:pointer}
.si-seg button[aria-pressed="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}
.si-seg button:hover{color:var(--dsw-alias-label-primary)}
.si-btn{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;font:inherit;font-size:12px;padding:5px 12px;cursor:pointer}
.si-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.si-btn[aria-pressed="true"]{border-color:var(--si-gold,var(--dsw-alias-state-warn-primary));color:var(--si-gold,var(--dsw-alias-state-warn-primary))}
.si-btn:disabled{opacity:.5;cursor:default}
.si-btn.primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-bg-base);font-weight:600}
.si-btn.primary:hover{opacity:.9}
.si-btn.ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary);padding-left:6px;padding-right:6px}
.si-btn.ghost:hover{color:var(--dsw-alias-label-primary);background:transparent}
.si-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px}
.si-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;min-width:0}
.si-card-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding-bottom:6px;border-bottom:1px solid var(--si-line,var(--dsw-alias-border-l1))}
.si-card-title{margin:0;font-size:14px;font-weight:650;font-family:var(--si-serif,inherit);letter-spacing:.04em}
.si-card-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:11.5px}
.si-empty{color:var(--dsw-alias-label-secondary);font-size:12px;padding:8px 0}
.si-rows{display:flex;flex-direction:column;gap:9px}
.si-row{display:flex;flex-direction:column;gap:3px}
.si-row-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.si-row-name{font-size:12.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.si-row-meta{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}
.si-track{height:4px;border-radius:2px;background:var(--dsw-alias-border-l1);overflow:hidden}
.si-fill{display:block;height:100%;border-radius:2px;background:var(--dsw-alias-brand-primary)}
.si-fill.bad{background:var(--dsw-alias-state-error-primary)}
.si-fill.warn{background:var(--dsw-alias-state-warn-primary)}
.si-tag{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:0 7px;font-size:10.5px;line-height:17px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.si-tag.bad{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.si-tag.warn{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.si-tag.ok{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.si-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.si-board{display:grid;grid-template-columns:repeat(auto-fit,minmax(272px,1fr));gap:12px;align-items:start}
.si-col{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:10px;display:flex;flex-direction:column;gap:8px;min-width:0}
.si-col-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 4px 7px;border-bottom:1px solid var(--si-line,var(--dsw-alias-border-l1))}
.si-col-name{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;font-family:var(--si-serif,inherit);letter-spacing:.04em}
.si-col-roman{font-family:var(--si-serif,inherit);font-size:9.5px;letter-spacing:.2em;color:var(--si-gold,var(--dsw-alias-state-warn-primary))}
.si-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
.si-dot.pain{background:var(--dsw-alias-state-error-primary)}
.si-dot.redundant{background:var(--dsw-alias-state-warn-primary)}
.si-dot.ok{background:var(--dsw-alias-state-success-primary)}
.si-col-count{font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.si-session{display:flex;flex-direction:column;gap:6px;text-align:left;width:100%;border:1px solid var(--dsw-alias-border-l1);border-left-width:2px;background:var(--dsw-alias-bg-base);border-radius:9px;padding:9px 10px;cursor:pointer;font:inherit;color:inherit;transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease}
.si-session:hover{background:var(--dsw-alias-bg-layer-2);transform:translateY(-1px);box-shadow:0 4px 14px color-mix(in oklab,var(--dsw-alias-label-primary) 8%,transparent)}
.si-session:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.si-session[data-status="pain"]{border-left-color:var(--dsw-alias-state-error-primary)}
.si-session[data-status="redundant"]{border-left-color:var(--dsw-alias-state-warn-primary)}
.si-session[data-status="ok"]{border-left-color:var(--dsw-alias-state-success-primary)}
.si-session-title{display:flex;align-items:flex-start;gap:6px;font-size:12.5px;font-weight:600;line-height:1.4;word-break:break-word}
.si-session-ws{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.si-session-metrics{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.si-session-metrics .bad{color:var(--dsw-alias-state-error-primary)}
.si-session-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}
.si-chips{display:flex;gap:4px;flex-wrap:wrap;min-width:0}
.si-detail-head{display:flex;flex-direction:column;gap:6px}
.si-detail-hero{position:relative;border:1px solid var(--si-line,var(--dsw-alias-border-l1));border-radius:3px;background:var(--si-paper,var(--dsw-alias-bg-layer-1));padding:15px 19px 14px;box-shadow:inset 0 0 0 4px color-mix(in oklab,var(--dsw-alias-bg-base) 62%,transparent),inset 0 0 0 5px var(--si-gold-soft,transparent);display:flex;flex-direction:column;gap:5px}
.si-detail-hero-title{margin:1px 0 0;font-family:var(--si-serif,inherit);font-size:20px;font-weight:600;letter-spacing:.03em;line-height:1.35;word-break:break-word}
.si-detail-hero-sub{margin:0;font-size:11.5px;color:var(--si-muted,var(--dsw-alias-label-secondary));word-break:break-word}
.si-detail-hero-meta{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}
.si-detail-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.si-detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;align-items:start}
.si-stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:8px}
.si-stat{display:flex;flex-direction:column;gap:1px;border-top:1px solid var(--si-line,var(--dsw-alias-border-l1));padding-top:5px;min-width:0}
.si-stat-label{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--si-muted,var(--dsw-alias-label-secondary));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.si-stat-value{font-family:var(--si-serif,inherit);font-size:17px;font-variant-numeric:tabular-nums;line-height:1.25}
.si-stat.bad .si-stat-value{color:var(--dsw-alias-state-error-primary)}
.si-list{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}
.si-item{display:flex;flex-direction:column;gap:4px;border-left:2px solid var(--dsw-alias-border-l2);padding-left:9px}
.si-item.pain{border-left-color:var(--dsw-alias-state-error-primary)}
.si-item.warn{border-left-color:var(--dsw-alias-state-warn-primary)}
.si-item-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.si-item-name{font-size:12.5px;font-weight:600;word-break:break-word}
.si-item-body{font-size:11.5px;color:var(--dsw-alias-label-secondary);word-break:break-word}
.si-quote{font-size:11.5px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:6px;padding:5px 8px;word-break:break-word;white-space:pre-wrap}
.si-audit-body{margin:0;font-size:13px;white-space:pre-wrap;word-break:break-word;line-height:1.7;min-height:22px}
.si-audit-body h3{margin:14px 0 4px;font-size:13.5px}
.si-audit-body p{margin:4px 0}
.si-audit-body ul{margin:4px 0;padding-left:18px}
.si-audit-body li{margin:2px 0}
.si-audit-body code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px;background:var(--dsw-alias-bg-layer-2);border-radius:4px;padding:0 4px}
.si-note{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin:0}
.si-banner{border:1px solid var(--dsw-alias-state-error-primary);border-radius:10px;padding:11px 13px;display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-layer-1)}
.si-banner-title{font-size:12.5px;font-weight:650;color:var(--dsw-alias-state-error-primary)}
.si-banner-body{font-size:12px;color:var(--dsw-alias-label-secondary);word-break:break-word}
.si-row-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.si-spin{display:inline-block;width:12px;height:12px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:si-spin .9s linear infinite;vertical-align:-2px}
@keyframes si-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.si-spin{animation:none}}
.si-root{
  --si-serif:"Iowan Old Style","Palatino Linotype","Book Antiqua","Songti SC","Noto Serif SC","Source Han Serif SC",Georgia,serif;
  --si-mono:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;
  --si-gold:color-mix(in oklab,var(--dsw-alias-state-warn-primary) 76%,var(--dsw-alias-label-primary) 24%);
  --si-gold-soft:color-mix(in oklab,var(--dsw-alias-state-warn-primary) 32%,transparent);
  --si-paper:color-mix(in oklab,var(--dsw-alias-bg-layer-1) 90%,var(--dsw-alias-state-warn-primary) 10%);
  --si-paper-deep:color-mix(in oklab,var(--dsw-alias-bg-layer-2) 88%,var(--dsw-alias-state-warn-primary) 12%);
  --si-line:color-mix(in oklab,var(--dsw-alias-label-primary) 15%,transparent);
  --si-line-strong:color-mix(in oklab,var(--dsw-alias-label-primary) 28%,transparent);
  --si-muted:color-mix(in oklab,var(--dsw-alias-label-primary) 56%,transparent);
}
.si-museum-head{position:relative;padding:20px 26px 17px;border:1px solid var(--si-line);border-radius:3px;background:var(--si-paper);box-shadow:inset 0 0 0 5px color-mix(in oklab,var(--dsw-alias-bg-base) 62%,transparent),inset 0 0 0 6px var(--si-gold-soft)}
.si-museum-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.si-museum-name{display:flex;align-items:baseline;gap:13px;flex-wrap:wrap}
.si-museum-name h1{margin:0;font-family:var(--si-serif);font-size:25px;line-height:1.15;font-weight:600;letter-spacing:.08em}
.si-museum-latin{font-family:var(--si-serif);font-size:9.5px;letter-spacing:.34em;text-transform:uppercase;color:var(--si-gold);font-weight:600;white-space:nowrap}
.si-museum-tagline{margin:7px 0 0;font-family:var(--si-serif);font-size:12.5px;color:var(--si-muted);letter-spacing:.01em}
.si-ornament{display:flex;align-items:center;gap:10px;margin:13px 0 0;color:var(--si-gold)}
.si-ornament::before,.si-ornament::after{content:"";height:1px;flex:1;background:linear-gradient(90deg,transparent,var(--si-gold-soft) 30%,var(--si-gold))}
.si-ornament::after{background:linear-gradient(90deg,var(--si-gold),var(--si-gold-soft) 70%,transparent)}
.si-ornament i{width:6px;height:6px;border:1px solid var(--si-gold);transform:rotate(45deg);display:block}
.si-tabs{display:inline-flex;gap:2px;border:1px solid var(--si-line);border-radius:2px;padding:2px;background:var(--si-paper-deep)}
.si-tabs button{border:0;background:transparent;color:var(--si-muted);font:inherit;font-size:11.5px;letter-spacing:.06em;padding:4px 12px;border-radius:1px;cursor:pointer}
.si-tabs button[aria-pressed="true"]{background:var(--si-paper);color:var(--dsw-alias-label-primary);box-shadow:inset 0 0 0 1px var(--si-line)}
.si-tabs button:hover{color:var(--dsw-alias-label-primary)}
.si-plaques{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px}
.si-plaque{position:relative;border:1px solid var(--si-line);border-radius:2px;background:var(--si-paper);padding:10px 12px 9px;display:flex;flex-direction:column;gap:1px;min-width:0}
.si-plaque::before{content:"";position:absolute;left:12px;top:0;width:24px;height:1px;background:var(--si-gold)}
.si-plaque-label{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--si-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.si-plaque-value{font-family:var(--si-serif);font-size:23px;line-height:1.22;font-variant-numeric:tabular-nums}
.si-plaque-foot{font-size:10.5px;color:var(--si-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.si-plaque.gold .si-plaque-value{color:var(--si-gold)}
.si-plaque.bad .si-plaque-value{color:var(--dsw-alias-state-error-primary)}
.si-plaque.warn .si-plaque-value{color:var(--dsw-alias-state-warn-primary)}
.si-species-wall{display:flex;flex-wrap:wrap;gap:6px}
.si-species-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--si-line);border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:11.5px;padding:3px 11px 3px 9px;cursor:pointer;line-height:20px}
.si-species-chip:hover{border-color:var(--si-line-strong)}
.si-species-chip[aria-pressed="true"]{border-color:var(--si-gold);box-shadow:inset 0 0 0 1px var(--si-gold-soft);color:var(--dsw-alias-label-primary)}
.si-species-chip .si-dot{width:6px;height:6px;background:var(--si-gold)}
.si-species-count{font-size:10.5px;color:var(--si-muted);font-variant-numeric:tabular-nums}
.si-species-bar{position:relative;width:36px;height:2px;background:var(--si-line);border-radius:1px;overflow:hidden}
.si-species-bar i{position:absolute;inset:0 auto 0 0;background:var(--si-gold);display:block}
.si-halls{display:grid;grid-template-columns:repeat(auto-fit,minmax(256px,1fr));gap:12px;align-items:start}
.si-hall{border:1px solid var(--si-line);border-radius:2px;background:color-mix(in oklab,var(--si-paper) 62%,var(--dsw-alias-bg-base) 38%);padding:9px 10px 10px;display:flex;flex-direction:column;gap:8px;min-width:0}
.si-hall-head{display:flex;flex-direction:column;gap:3px;padding:2px 2px 7px;border-bottom:1px solid var(--si-line)}
.si-hall-name{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.si-hall-roman{font-family:var(--si-serif);font-size:10px;letter-spacing:.22em;color:var(--si-gold);margin-right:6px}
.si-hall-title{font-family:var(--si-serif);font-size:14px;font-weight:600;letter-spacing:.07em}
.si-hall-count{font-size:11px;color:var(--si-muted);font-variant-numeric:tabular-nums}
.si-hall-hint{margin:0;font-size:10.5px;color:var(--si-muted);line-height:1.5}
.si-exhibit{position:relative;display:flex;flex-direction:column;gap:7px;text-align:left;width:100%;border:1px solid var(--si-line);border-radius:2px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;padding:12px 12px 10px;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
.si-exhibit::after{content:"";position:absolute;inset:4px;border:1px solid var(--si-gold-soft);pointer-events:none;border-radius:1px}
.si-exhibit:hover{border-color:var(--si-line-strong);transform:translateY(-2px);box-shadow:0 7px 18px color-mix(in oklab,var(--dsw-alias-label-primary) 8%,transparent)}
.si-exhibit:focus-visible{outline:2px solid var(--si-gold);outline-offset:2px}
.si-exhibit.reflected{border-left:2px solid var(--si-gold)}
.si-exhibit-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding-right:2px}
.si-exhibit-no{font-family:var(--si-mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--si-gold)}
.si-exhibit-time{font-size:10px;color:var(--si-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.si-exhibit-species{font-family:var(--si-serif);font-size:13.5px;font-weight:600;line-height:1.4;letter-spacing:.02em;word-break:break-word}
.si-exhibit-tool{font-family:var(--si-mono);font-size:10px;color:var(--si-muted)}
.si-exhibit-quote{font-family:var(--si-mono);font-size:10.5px;line-height:1.55;color:var(--si-muted);background:var(--si-paper-deep);border-radius:1px;padding:5px 7px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.si-exhibit-badges{display:flex;flex-wrap:wrap;gap:4px}
.si-badge{display:inline-flex;align-items:center;gap:3px;font-size:9.5px;letter-spacing:.05em;border:1px solid var(--si-line);border-radius:999px;padding:0 6px;line-height:15px;color:var(--si-muted);white-space:nowrap}
.si-badge.gold{color:var(--si-gold);border-color:color-mix(in oklab,var(--si-gold) 55%,transparent)}
.si-badge.ok{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in oklab,var(--dsw-alias-state-success-primary) 45%,transparent)}
.si-badge.bad{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in oklab,var(--dsw-alias-state-error-primary) 45%,transparent)}
.si-exhibit-foot{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:10px;color:var(--si-muted);border-top:1px dotted var(--si-line);padding-top:6px}
.si-exhibit-session{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.si-placard{position:relative;border:1px solid var(--si-line);border-radius:3px;background:var(--si-paper);padding:19px 22px 18px;box-shadow:inset 0 0 0 5px color-mix(in oklab,var(--dsw-alias-bg-base) 62%,transparent),inset 0 0 0 6px var(--si-gold-soft);display:flex;flex-direction:column;gap:13px}
.si-placard-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.si-placard-no{font-family:var(--si-mono);font-size:10px;letter-spacing:.16em;color:var(--si-gold);text-transform:uppercase}
.si-placard-species{font-family:var(--si-serif);font-size:21px;font-weight:600;letter-spacing:.04em;margin:3px 0 0;line-height:1.3}
.si-placard-sub{font-size:11.5px;color:var(--si-muted);margin:4px 0 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.si-placard-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px 14px;padding:10px 0 2px;border-top:1px solid var(--si-line)}
.si-placard-meta div{display:flex;flex-direction:column;gap:1px;min-width:0}
.si-placard-meta dt{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--si-muted)}
.si-placard-meta dd{margin:0;font-family:var(--si-serif);font-size:13px;font-variant-numeric:tabular-nums}
.si-artifact{position:relative;border:1px solid var(--si-line-strong);background:var(--dsw-alias-bg-layer-2);padding:12px 14px;font-family:var(--si-mono);font-size:11.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:200px;overflow:auto}
.si-artifact-label{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--si-gold);margin-bottom:5px;font-family:var(--si-serif)}
.si-artifact::before,.si-artifact::after{content:"";position:absolute;width:9px;height:9px;border:1px solid var(--si-gold);pointer-events:none}
.si-artifact::before{left:-1px;top:-1px;border-right:0;border-bottom:0}
.si-artifact::after{right:-1px;bottom:-1px;border-left:0;border-top:0}
.si-trail{display:flex;flex-direction:column;margin:0;padding:0;list-style:none}
.si-step{position:relative;display:grid;grid-template-columns:18px minmax(0,1fr);gap:11px;padding:5px 0}
.si-step::before{content:"";position:absolute;left:8px;top:0;bottom:0;width:1px;background:var(--si-line)}
.si-step:first-child::before{top:9px}
.si-step:last-child::before{bottom:calc(100% - 9px)}
.si-node{position:relative;width:17px;height:17px;border-radius:50%;border:1px solid var(--si-line-strong);background:var(--dsw-alias-bg-base);margin-top:1px;display:grid;place-items:center;font-size:8px;line-height:1;color:var(--si-muted);z-index:1}
.si-step.ok .si-node{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}
.si-step.fail .si-node{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:color-mix(in oklab,var(--dsw-alias-state-error-primary) 12%,var(--dsw-alias-bg-base))}
.si-step.reflect .si-node{border-color:var(--si-gold);color:var(--si-gold);border-radius:2px;transform:rotate(45deg)}
.si-step-body{display:flex;flex-direction:column;gap:2px;min-width:0}
.si-step-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.si-step-tool{font-family:var(--si-serif);font-size:12.5px;font-weight:600}
.si-step-args{font-family:var(--si-mono);font-size:10.5px;color:var(--si-muted);word-break:break-word}
.si-step-tag{font-size:9.5px;letter-spacing:.06em;border:1px solid var(--si-line);border-radius:999px;padding:0 5px;line-height:14px;color:var(--si-muted)}
.si-step-tag.ok{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in oklab,var(--dsw-alias-state-success-primary) 40%,transparent)}
.si-step-tag.fail{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in oklab,var(--dsw-alias-state-error-primary) 40%,transparent)}
.si-quote-block{border-left:2px solid var(--si-gold);padding:2px 0 2px 12px;font-family:var(--si-serif);font-size:13px;line-height:1.65}
.si-quote-meta{display:block;font-family:var(--si-serif);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--si-gold);margin-bottom:3px}
.si-curator{border-top:1px solid var(--si-line);padding-top:10px;font-family:var(--si-serif);font-size:12.5px;line-height:1.75}
.si-curator-label{display:block;font-family:var(--si-serif);font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--si-gold);margin-bottom:4px}
.si-note-card{border:1px solid var(--si-line);border-radius:2px;background:var(--si-paper);padding:13px 16px;display:flex;flex-direction:column;gap:8px}
.si-note-card h2{margin:0;font-family:var(--si-serif);font-size:14px;font-weight:600;letter-spacing:.06em}
.si-note-list{margin:0;padding-left:17px;display:flex;flex-direction:column;gap:6px;font-family:var(--si-serif);font-size:12.5px;line-height:1.65}
.si-museum-empty{border:1px dashed var(--si-line);border-radius:2px;padding:26px;text-align:center;font-family:var(--si-serif);color:var(--si-muted)}
.si-mini-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:7px}
.si-mini{display:flex;flex-direction:column;gap:2px;text-align:left;border:1px solid var(--si-line,var(--dsw-alias-border-l1));background:var(--dsw-alias-bg-base);color:inherit;font:inherit;padding:7px 9px;border-radius:2px;cursor:pointer}
.si-mini:hover{border-color:var(--si-line-strong,var(--dsw-alias-border-l2))}
.si-mini-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.si-mini-no{font-family:var(--si-mono);font-size:9.5px;letter-spacing:.12em;color:var(--si-gold)}
.si-mini-title{font-family:var(--si-serif);font-size:12.5px;font-weight:600}
.si-mini-meta{font-size:10.5px;color:var(--si-muted)}
.si-daily{display:flex;flex-direction:column;gap:5px;margin-top:3px}
.si-daybars{display:flex;align-items:flex-end;gap:2px;height:86px;padding:2px 0 0;border-bottom:1px solid var(--si-line)}
.si-daybar{flex:1;min-width:2px;height:100%;display:flex;align-items:flex-end}
.si-daybar i{display:block;width:100%;background:color-mix(in oklab,var(--si-gold) 52%,transparent);border-radius:1px 1px 0 0;transition:background .15s ease}
.si-daybar:hover i{background:var(--si-gold)}
.si-daybar.zero i{background:var(--si-line)}
.si-daybar.peak i{background:var(--si-gold)}
.si-dayaxis{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:10px;color:var(--si-muted);font-variant-numeric:tabular-nums}
.si-daypeak{color:var(--si-gold);font-family:var(--si-serif);letter-spacing:.04em}
@media (prefers-reduced-motion:reduce){.si-daybar i,.si-session{transition:none}}
.si-stamp{position:absolute;right:16px;top:14px;width:44px;height:44px;border:1px solid var(--si-gold);border-radius:50%;display:grid;place-items:center;color:var(--si-gold);font-family:var(--si-serif);font-size:10px;letter-spacing:.1em;transform:rotate(-9deg);opacity:.85;text-align:center;line-height:1.1;padding:4px}
@media (prefers-reduced-motion:reduce){.si-exhibit{transition:none}}
`

    function StyleTag() {
      return h('style', { media: 'all' }, CSS)
    }

    // -------------------------------------------------------------- primitives
    function Plaque({ label, value, foot, tone }) {
      return h(
        'div',
        { className: `si-plaque${tone ? ` ${tone}` : ''}` },
        h('div', { className: 'si-plaque-label', title: label }, label),
        h('div', { className: 'si-plaque-value' }, value),
        foot ? h('div', { className: 'si-plaque-foot', title: foot }, foot) : null,
      )
    }

    function Bar({ ratio, tone }) {
      const width = `${Math.max(2, Math.min(100, Math.round((Number(ratio) || 0) * 100)))}%`
      return h('div', { className: 'si-track' }, h('span', { className: `si-fill${tone ? ` ${tone}` : ''}`, style: { width } }))
    }

    function KindTag({ kind, t }) {
      const tone = kind === 'user' || kind === 'turn' || kind === 'approval' ? 'warn' : null
      return h('span', { className: `si-tag${tone ? ` ${tone}` : ''}` }, t(`kind.${kind}`) ?? kind)
    }

    function Banner({ title, body, action }) {
      return h(
        'div',
        { className: 'si-banner', role: 'alert' },
        h('div', { className: 'si-banner-title' }, title),
        h('div', { className: 'si-banner-body' }, body),
        action ? h('div', { className: 'si-row-actions' }, action) : null,
      )
    }

    // ------------------------------------------------------------------ pains
    function PainsCard({ report, t, locale }) {
      const pains = report.painPoints ?? []
      const maxSessions = pains.reduce((max, item) => Math.max(max, item.sessions ?? 0), 0) || 1
      return h(
        'section',
        { className: 'si-card' },
        h(
          'div',
          { className: 'si-card-head' },
          h('h2', { className: 'si-card-title' }, t('pains.title')),
          h('span', { className: 'si-col-count' }, num(pains.length, locale)),
        ),
        h('p', { className: 'si-card-hint' }, t('pains.hint')),
        pains.length === 0
          ? h('div', { className: 'si-empty' }, t('pains.empty'))
          : h(
              'div',
              { className: 'si-rows' },
              pains.map((pain) =>
                h(
                  'div',
                  { className: 'si-row', key: pain.id },
                  h(
                    'div',
                    { className: 'si-row-top' },
                    h('span', { className: 'si-row-name', title: pain.advice || pain.label }, pain.label),
                    h(
                      'span',
                      { className: 'si-row-meta' },
                      format(t('pains.meta'), { count: num(pain.count, locale), sessions: num(pain.sessions, locale) }),
                    ),
                  ),
                  h(Bar, { ratio: (pain.sessions ?? 0) / maxSessions, tone: pain.kind === 'tool' ? 'bad' : 'warn' }),
                  h(
                    'div',
                    { className: 'si-chips' },
                    h(KindTag, { kind: pain.kind, t }),
                    (pain.tools ?? []).slice(0, 2).map((tool) =>
                      h('span', { className: 'si-tag', key: tool.name }, `${tool.name} ×${tool.count}`),
                    ),
                    pain.examples?.[0] ? h('span', { className: 'si-code', title: pain.examples[0] }, pain.examples[0]) : null,
                  ),
                ),
              ),
            ),
      )
    }

    function FlowsCard({ report, t, locale }) {
      const flows = report.redundantFlows ?? []
      const maxRepeats = flows.reduce((max, item) => Math.max(max, item.repeats ?? 0), 0) || 1
      return h(
        'section',
        { className: 'si-card' },
        h(
          'div',
          { className: 'si-card-head' },
          h('h2', { className: 'si-card-title' }, t('flows.title')),
          h('span', { className: 'si-col-count' }, num(flows.length, locale)),
        ),
        h('p', { className: 'si-card-hint' }, t('flows.hint')),
        flows.length === 0
          ? h('div', { className: 'si-empty' }, t('flows.empty'))
          : h(
              'div',
              { className: 'si-rows' },
              flows.map((flow, index) =>
                h(
                  'div',
                  { className: 'si-row', key: `${flow.kind}-${index}` },
                  h(
                    'div',
                    { className: 'si-row-top' },
                    h('span', { className: 'si-row-name' }, t(`flow.${flow.kind}`) ?? flow.kind),
                    h(
                      'span',
                      { className: 'si-row-meta' },
                      format(t('flows.meta'), { repeats: num(flow.repeats, locale), sessions: num(flow.sessions, locale) }),
                    ),
                  ),
                  h(Bar, { ratio: (flow.repeats ?? 0) / maxRepeats, tone: 'warn' }),
                  h('span', { className: 'si-code', title: flow.detail }, flow.detail),
                ),
              ),
            ),
      )
    }

    // ----------------------------------------------------------------- museum
    const HALLS = [
      { id: 'restored', roman: 'I' },
      { id: 'retried', roman: 'II' },
      { id: 'handback', roman: 'III' },
      { id: 'stalled', roman: 'IV' },
    ]

    const EXHIBIT_LIMIT = 10

    function Plaque({ label, value, foot, tone }) {
      return h(
        'div',
        { className: `si-plaque${tone ? ` ${tone}` : ''}` },
        h('div', { className: 'si-plaque-label', title: label }, label),
        h('div', { className: 'si-plaque-value' }, value),
        foot ? h('div', { className: 'si-plaque-foot', title: foot }, foot) : null,
      )
    }

    function MuseumStats({ museum, t, locale }) {
      const stats = museum.stats
      return h(
        'div',
        { className: 'si-plaques' },
        h(Plaque, {
          label: t('museum.kpi.exhibits'),
          value: num(stats.exhibits, locale),
          foot: format(t('museum.kpi.exhibits.foot'), { sessions: num(stats.sessions, locale), recent: num(stats.recent7d, locale) }),
        }),
        h(Plaque, {
          label: t('museum.kpi.recovery'),
          value: pct(stats.recoveryRate),
          foot: format(t('museum.kpi.recovery.foot'), { fixed: num(stats.fixed, locale) }),
        }),
        h(Plaque, {
          label: t('museum.kpi.reflection'),
          value: pct(stats.reflectionRate),
          foot: format(t('museum.kpi.reflection.foot'), { selfCorrect: num(stats.selfCorrect, locale) }),
          tone: 'gold',
        }),
        h(Plaque, {
          label: t('museum.kpi.verbatim'),
          value: num(stats.verbatim, locale),
          foot: format(t('museum.kpi.verbatim.foot'), { repeated: num(stats.repeated, locale) }),
        }),
        h(Plaque, {
          label: t('museum.kpi.steps'),
          value: stats.avgStepsToFix > 0 ? `${stats.avgStepsToFix}` : '—',
          foot: format(t('museum.kpi.steps.foot'), { pending: num(stats.pending ?? 0, locale) }),
        }),
      )
    }

    function DailyCurve({ museum, t, locale }) {
      const daily = museum.daily ?? []
      const max = daily.reduce((value, day) => Math.max(value, day.count), 0) || 1
      let peak = null
      for (const day of daily) if (!peak || day.count > peak.count) peak = day
      const week = daily.slice(-7).reduce((sum, day) => sum + day.count, 0)
      const label = (date) => (typeof date === 'string' ? date.slice(5).replace('-', '/') : '')
      return h(
        'section',
        { className: 'si-note-card' },
        h(
          'div',
          { className: 'si-card-head' },
          h('h2', { style: { margin: 0 } }, t('museum.daily.title')),
          h('span', { className: 'si-col-count' }, format(t('museum.daily.week'), { count: num(week, locale) })),
        ),
        h('p', { className: 'si-card-hint', style: { margin: 0 } }, t('museum.daily.hint')),
        daily.length === 0
          ? h('div', { className: 'si-museum-empty' }, t('museum.daily.empty'))
          : h(
              'div',
              { className: 'si-daily' },
              h(
                'div',
                { className: 'si-daybars', role: 'img', 'aria-label': t('museum.daily.title') },
                daily.map((day) =>
                  h(
                    'div',
                    {
                      key: day.date,
                      className: `si-daybar${day.count === 0 ? ' zero' : ''}${day.count === max ? ' peak' : ''}`,
                      title: format(t('museum.daily.bar'), { date: day.date, count: day.count }),
                    },
                    h('i', { style: { height: day.count === 0 ? '2px' : `${Math.max(5, Math.round((day.count / max) * 100))}%` } }),
                  ),
                ),
              ),
              h(
                'div',
                { className: 'si-dayaxis' },
                h('span', null, daily[0] ? label(daily[0].date) : ''),
                peak ? h('span', { className: 'si-daypeak' }, format(t('museum.daily.peak'), { date: label(peak.date), count: peak.count })) : null,
                h('span', null, daily.length > 0 ? label(daily[daily.length - 1].date) : ''),
              ),
            ),
      )
    }

    function SpeciesWall({ museum, active, onPick, t, locale }) {
      const species = museum.species ?? []
      const max = species.reduce((value, item) => Math.max(value, item.count ?? 0), 0) || 1
      return h(
        'div',
        { className: 'si-species-wall', role: 'group', 'aria-label': t('museum.species.title') },
        h(
          'button',
          {
            type: 'button',
            className: 'si-species-chip',
            'aria-pressed': active === null,
            onClick: () => onPick(null),
          },
          h('span', { className: 'si-dot' }),
          t('museum.species.all'),
          h('span', { className: 'si-species-count' }, num(museum.stats.exhibits, locale)),
        ),
        species.map((item) =>
          h(
            'button',
            {
              type: 'button',
              key: item.id,
              className: 'si-species-chip',
              'aria-pressed': active === item.id,
              title: item.advice || item.label,
              onClick: () => onPick(active === item.id ? null : item.id),
            },
            h('span', { className: 'si-dot' }),
            item.label,
            h('span', { className: 'si-species-count' }, `${item.count}`),
            h('span', { className: 'si-species-bar', 'aria-hidden': true }, h('i', { style: { width: `${Math.round((item.count / max) * 100)}%` } })),
          ),
        ),
      )
    }

    function ExhibitCard({ exhibit, t, locale, onOpen }) {
      const reflection = exhibit.reflection ?? { kind: 'none' }
      const reflected = reflection.kind === 'self-correct' || reflection.kind === 'replan'
      const tone = exhibit.outcome === 'fixed' ? 'ok' : exhibit.outcome === 'repeated' ? 'bad' : null
      return h(
        'button',
        {
          type: 'button',
          className: `si-exhibit${reflected ? ' reflected' : ''}`,
          onClick: () => onOpen(exhibit.id),
          'aria-label': `${format(t('museum.no'), { no: exhibit.no })} ${exhibit.speciesLabel}`,
        },
        h(
          'span',
          { className: 'si-exhibit-top' },
          h('span', { className: 'si-exhibit-no' }, format(t('museum.no'), { no: String(exhibit.no).padStart(3, '0') })),
          h('span', { className: 'si-exhibit-time' }, dateTime(exhibit.time, locale)),
        ),
        h('span', { className: 'si-exhibit-species' }, exhibit.speciesLabel),
        h('span', { className: 'si-exhibit-tool' }, [exhibit.tool || t('kind.turn'), exhibit.turn > 0 ? format(t('museum.card.turn'), { n: exhibit.turn }) : ''].filter(Boolean).join(' · ')),
        exhibit.error ? h('span', { className: 'si-exhibit-quote' }, exhibit.error) : null,
        h(
          'span',
          { className: 'si-exhibit-badges' },
          h('span', { className: `si-badge${tone ? ` ${tone}` : ''}` }, t(`museum.outcome.${exhibit.outcome}`)),
          exhibit.verdict === 'retried-verbatim'
            ? h('span', { className: 'si-badge gold' }, format(t('museum.card.retried'), { n: Math.max(1, exhibit.retries) }))
            : null,
          exhibit.repeated ? h('span', { className: 'si-badge bad' }, t('museum.card.repeated')) : null,
          reflected ? h('span', { className: 'si-badge gold' }, t('museum.card.reflected')) : null,
          exhibit.refused ? h('span', { className: 'si-badge bad' }, t('museum.card.refused')) : null,
        ),
        h(
          'span',
          { className: 'si-exhibit-foot' },
          h('span', { className: 'si-exhibit-session', title: exhibit.sessionTitle }, exhibit.sessionTitle || '—'),
          h('span', null, t('museum.card.open') + ' →'),
        ),
      )
    }

    function HallBoard({ museum, activeSpecies, onlyReflected, t, locale, onOpen, limits, setLimits }) {
      const grouped = useMemo(() => {
        const buckets = { restored: [], retried: [], handback: [], stalled: [] }
        for (const exhibit of museum.exhibits ?? []) {
          if (activeSpecies && exhibit.species !== activeSpecies) continue
          if (onlyReflected && !['self-correct', 'replan'].includes(exhibit.reflection?.kind)) continue
          const bucket = buckets[exhibit.hall] ?? buckets.stalled
          bucket.push(exhibit)
        }
        for (const key of Object.keys(buckets)) {
          buckets[key].sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
        }
        return buckets
      }, [museum, activeSpecies, onlyReflected])
      const total = Object.values(grouped).reduce((sum, rows) => sum + rows.length, 0)
      return h(
        'section',
        { style: { display: 'flex', flexDirection: 'column', gap: 9 } },
        h(
          'div',
          { className: 'si-card-head' },
          h('h2', { className: 'si-card-title', style: { fontFamily: 'var(--si-serif)', letterSpacing: '.06em' } }, t('museum.board.title')),
          h(
            'span',
            { className: 'si-col-count' },
            activeSpecies || onlyReflected
              ? format(t('museum.filter.result'), { n: num(total, locale) })
              : format(t('museum.board.shown'), { shown: num((museum.exhibits ?? []).length, locale), total: num(museum.stats.exhibits, locale) }),
          ),
        ),
        h('p', { className: 'si-card-hint' }, t('museum.board.hint')),
        total === 0
          ? h('div', { className: 'si-museum-empty' }, h('div', null, t('museum.empty')), h('div', { style: { fontSize: 11.5, marginTop: 4 } }, t('museum.empty.hint')))
          : h(
              'div',
              { className: 'si-halls' },
              HALLS.map((hall) => {
                const rows = grouped[hall.id] ?? []
                const limit = limits[hall.id] ?? EXHIBIT_LIMIT
                const visible = rows.slice(0, limit)
                const remaining = rows.length - visible.length
                return h(
                  'div',
                  { className: 'si-hall', key: hall.id },
                  h(
                    'div',
                    { className: 'si-hall-head' },
                    h(
                      'div',
                      { className: 'si-hall-name' },
                      h('span', null, h('span', { className: 'si-hall-roman' }, hall.roman), h('span', { className: 'si-hall-title' }, t(`museum.hall.${hall.id}`))),
                      h('span', { className: 'si-hall-count' }, num(rows.length, locale)),
                    ),
                    h('p', { className: 'si-hall-hint' }, t(`museum.hall.${hall.id}.hint`)),
                  ),
                  visible.length === 0
                    ? h('div', { className: 'si-empty', style: { fontSize: 11 } }, t('museum.hall.empty'))
                    : visible.map((exhibit) => h(ExhibitCard, { key: exhibit.id, exhibit, t, locale, onOpen })),
                  remaining > 0
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'si-btn',
                          onClick: () => setLimits((current) => ({ ...current, [hall.id]: limit + EXHIBIT_LIMIT })),
                        },
                        format(t('museum.more'), { n: num(remaining, locale) }),
                      )
                    : null,
                )
              }),
            ),
      )
    }

    function CuratorNotes({ museum, t }) {
      return h(
        'section',
        { className: 'si-note-card' },
        h('h2', null, t('museum.notes.title')),
        h('p', { className: 'si-card-hint', style: { margin: 0 } }, t('museum.notes.hint')),
        h(
          'ul',
          { className: 'si-note-list' },
          (museum.notes ?? []).map((note) => h('li', { key: note.id }, note.text)),
        ),
      )
    }

    /** One deterministic paragraph describing how this exhibit was handled. */
    function curatorNote(exhibit, t) {
      const parts = []
      const fixed = exhibit.eventuallyFixed ? format(t('museum.note.fixed'), { n: exhibit.stepsToFix }) : t('museum.note.notFixed')
      if (exhibit.verdict === 'retried-verbatim') {
        parts.push(format(t('museum.note.retried-verbatim'), { n: Math.max(1, exhibit.retries) }))
      } else if (exhibit.verdict === 'retried-adjusted') {
        parts.push(format(t('museum.note.retried-adjusted'), { tool: exhibit.tool, fixed }))
      } else if (exhibit.verdict === 'switched-tool') {
        parts.push(format(t('museum.note.switched-tool'), { fixed }))
      } else if (exhibit.verdict === 'handback') {
        parts.push(t('museum.note.handback'))
      } else {
        parts.push(t('museum.note.none'))
      }
      if (exhibit.repeated) parts.push(format(t('museum.note.repeated'), { n: Math.max(1, exhibit.retries) }))
      if (exhibit.refused) parts.push(t('museum.note.refused'))
      return parts.join(' ')
    }

    function TrailStep({ step, t }) {
      const state = step.failed ? 'fail' : step.ok === true ? 'ok' : 'unknown'
      return h(
        'li',
        { className: `si-step ${state}` },
        h('span', { className: 'si-node', 'aria-hidden': true }, state === 'fail' ? '×' : state === 'ok' ? '' : '?'),
        h(
          'span',
          { className: 'si-step-body' },
          h('span', { className: 'si-step-head' }, h('span', { className: 'si-step-tool' }, step.tool), h('span', { className: `si-step-tag ${state}` }, t(`museum.detail.step.${state}`))),
          step.args ? h('span', { className: 'si-step-args' }, step.args) : null,
        ),
      )
    }

    function ExhibitDetail({ exhibit, t, locale, onBack, onOpenSession }) {
      if (!exhibit) {
        return h(
          'div',
          { className: 'si-detail-head' },
          h('button', { type: 'button', className: 'si-btn ghost', onClick: onBack }, `← ${t('museum.detail.back')}`),
          h(Banner, { title: t('museum.empty'), body: t('museum.detail.missing') }),
        )
      }
      const reflection = exhibit.reflection ?? { kind: 'none', quote: '' }
      const reflected = reflection.kind === 'self-correct' || reflection.kind === 'replan'
      const meta = [
        [t('museum.detail.meta'), t(`museum.verdict.${exhibit.verdict}`)],
        [t('museum.detail.outcome'), t(`museum.outcome.${exhibit.outcome}`)],
        [t('museum.detail.tool'), exhibit.tool || t('kind.turn')],
        [t('museum.detail.turn'), exhibit.turn > 0 ? String(exhibit.turn) : '—'],
      ]
      if (exhibit.stepsToFix > 0) meta.push([t('museum.detail.steps'), String(exhibit.stepsToFix)])
      if (exhibit.verdict === 'retried-verbatim') meta.push([t('museum.detail.retries'), String(Math.max(1, exhibit.retries))])
      return h(
        'div',
        { className: 'si-exhibit-page', style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        h(
          'div',
          { className: 'si-actions' },
          h('button', { type: 'button', className: 'si-btn ghost', onClick: onBack }, `← ${t('museum.detail.back')}`),
          exhibit.sessionId ? h('button', { type: 'button', className: 'si-btn ghost', onClick: () => onOpenSession(exhibit.sessionId) }, t('museum.detail.session')) : null,
        ),
        h(
          'section',
          { className: 'si-placard' },
          reflected ? h('div', { className: 'si-stamp', 'aria-hidden': true }, t(`museum.reflect.${reflection.kind}`)) : null,
          h(
            'div',
            { className: 'si-placard-top' },
            h(
              'div',
              null,
              h('div', { className: 'si-placard-no' }, format(t('museum.no'), { no: String(exhibit.no).padStart(3, '0') })),
              h('h1', { className: 'si-placard-species' }, exhibit.speciesLabel),
              h(
                'p',
                { className: 'si-placard-sub' },
                h('span', null, exhibit.sessionTitle || '—'),
                h('span', null, '·'),
                h('span', null, dateTime(exhibit.time, locale)),
              ),
            ),
          ),
          h(
            'dl',
            { className: 'si-placard-meta' },
            meta.map(([label, value]) => h('div', { key: label }, h('dt', null, label), h('dd', null, value))),
          ),
          exhibit.error
            ? h(
                'div',
                null,
                h('div', { className: 'si-artifact-label' }, t('museum.detail.artifact')),
                h('div', { className: 'si-artifact' }, exhibit.error),
              )
            : null,
          h('div', { className: 'si-curator' }, h('span', { className: 'si-curator-label' }, t('museum.detail.note')), curatorNote(exhibit, t)),
          exhibit.speciesAdvice
            ? h('p', { className: 'si-note', style: { margin: 0 } }, `${t('museum.detail.advice')}：${exhibit.speciesAdvice}`)
            : null,
        ),
        h(
          'div',
          { className: 'si-detail-grid' },
          h(
            'section',
            { className: 'si-card' },
            h('h2', { className: 'si-card-title' }, t('museum.detail.before')),
            (exhibit.before ?? []).length === 0
              ? h('div', { className: 'si-empty' }, t('museum.detail.before.empty'))
              : h('ul', { className: 'si-trail' }, exhibit.before.map((step, index) => h(TrailStep, { key: `before-${index}`, step, t }))),
          ),
          h(
            'section',
            { className: 'si-card' },
            h('h2', { className: 'si-card-title' }, t('museum.detail.after')),
            reflection.quote
              ? h(
                  'div',
                  { className: 'si-quote-block' },
                  h('span', { className: 'si-quote-meta' }, `${t('museum.detail.reflection')} · ${t(`museum.reflect.${reflection.kind}`)}`),
                  `「${reflection.quote}」`,
                )
              : exhibit.assistantText
                ? h(
                    'div',
                    { className: 'si-quote-block' },
                    h('span', { className: 'si-quote-meta' }, t('museum.detail.reaction')),
                    `「${exhibit.assistantText}」`,
                  )
                : h('p', { className: 'si-note', style: { margin: 0 } }, t('museum.detail.noReaction')),
            (exhibit.after ?? []).length === 0
              ? h('div', { className: 'si-empty', style: { marginTop: 8 } }, t('museum.detail.after.empty'))
              : h('ul', { className: 'si-trail', style: { marginTop: 8 } }, exhibit.after.map((step, index) => h(TrailStep, { key: `after-${index}`, step, t }))),
          ),
        ),
      )
    }

    // ------------------------------------------------------------------ board
    function SessionCard({ row, t, locale, onOpen }) {
      const title = row.title || t('card.untitled')
      return h(
        'button',
        {
          type: 'button',
          className: 'si-session',
          'data-status': row.status,
          onClick: () => onOpen(row.id),
          'aria-label': `${title} — ${format(t('card.calls'), { n: row.toolCalls })}`,
        },
        h(
          'span',
          { className: 'si-session-title' },
          h('span', { className: `si-dot ${row.status}` }),
          h('span', null, title),
        ),
        row.cwd ? h('span', { className: 'si-session-ws', title: row.cwd }, basename(row.cwd)) : null,
        h(
          'span',
          { className: 'si-session-metrics' },
          h('span', null, format(t('card.requests'), { n: num(row.userMessages, locale) })),
          h('span', null, format(t('card.calls'), { n: num(row.toolCalls, locale) })),
          row.toolFailures > 0
            ? h('span', { className: 'bad' }, format(t('card.fails'), { n: num(row.toolFailures, locale) }))
            : null,
          row.redundantCalls > 0 ? h('span', null, format(t('card.redundant'), { n: num(row.redundantCalls, locale) })) : null,
        ),
        h(
          'span',
          { className: 'si-session-foot' },
          h(
            'span',
            { className: 'si-chips' },
            (row.topPains ?? []).slice(0, 1).map((pain) => h('span', { className: 'si-tag bad', key: pain.id }, `${pain.label} ×${pain.count}`)),
          ),
          h('span', { className: 'si-session-ws' }, relativeTime(row.lastEventAt || row.createdAt, t)),
        ),
      )
    }

    function Board({ report, t, locale, onOpen, limits, setLimits }) {
      const columns = [
        { id: 'pain', label: t('board.pain'), roman: 'I' },
        { id: 'redundant', label: t('board.redundant'), roman: 'II' },
        { id: 'ok', label: t('board.ok'), roman: 'III' },
      ]
      const grouped = useMemo(() => {
        const buckets = { pain: [], redundant: [], ok: [] }
        for (const row of report.sessions ?? []) {
          const bucket = buckets[row.status] ?? buckets.ok
          bucket.push(row)
        }
        for (const key of Object.keys(buckets)) {
          buckets[key].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.lastEventAt ?? 0) - (a.lastEventAt ?? 0))
        }
        return buckets
      }, [report])
      return h(
        'section',
        { style: { display: 'flex', flexDirection: 'column', gap: 9 } },
        h(
          'div',
          { className: 'si-card-head' },
          h('h2', { className: 'si-card-title' }, t('board.title')),
          h('span', { className: 'si-col-count' }, num(report.sessions?.length ?? 0, locale)),
        ),
        h('p', { className: 'si-card-hint' }, t('board.hint')),
        h(
          'div',
          { className: 'si-board' },
          columns.map((column) => {
            const rows = grouped[column.id] ?? []
            const limit = limits[column.id] ?? BOARD_LIMIT
            const visible = rows.slice(0, limit)
            const remaining = rows.length - visible.length
            return h(
              'div',
              { className: 'si-col', key: column.id },
              h(
                'div',
                { className: 'si-col-head' },
                h('span', { className: 'si-col-name' }, h('span', { className: `si-dot ${column.id}` }), h('span', { className: 'si-col-roman' }, column.roman), column.label),
                h('span', { className: 'si-col-count' }, num(rows.length, locale)),
              ),
              visible.length === 0
                ? h('div', { className: 'si-empty' }, t('board.empty'))
                : visible.map((row) => h(SessionCard, { key: row.id, row, t, locale, onOpen })),
              remaining > 0
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'si-btn',
                      onClick: () => setLimits((current) => ({ ...current, [column.id]: limit + BOARD_LIMIT })),
                    },
                    format(t('action.more'), { n: num(remaining, locale) }),
                  )
                : null,
            )
          }),
        ),
      )
    }

    // ----------------------------------------------------------------- detail
    function MetricsCard({ session, t, locale }) {
      const rows = [
        ['metric.turns', session.turns, false],
        ['metric.steps', session.steps, false],
        ['metric.requests', session.userMessages, false],
        ['metric.injected', session.injectedMessages, false],
        ['metric.calls', session.toolCalls, false],
        ['metric.fails', session.toolFailures, true],
        ['metric.redundant', session.redundantCalls, true],
        ['metric.rereads', session.rereads, false],
        ['metric.denied', session.approvalsDenied, true],
      ]
      return h(
        'section',
        { className: 'si-card' },
        h('h2', { className: 'si-card-title' }, t('detail.metrics')),
        h(
          'div',
          { className: 'si-stat-grid' },
          rows.map(([key, value, alert]) =>
            h(
              'div',
              { className: `si-stat${alert && value > 0 ? ' bad' : ''}`, key },
              h('span', { className: 'si-stat-label' }, t(key)),
              h('strong', { className: 'si-stat-value' }, num(value, locale)),
            ),
          ),
        ),
      )
    }

    function PainsEvidence({ session, t, locale }) {
      const pains = session.pains ?? []
      return h(
        'section',
        { className: 'si-card' },
        h(
          'div',
          { className: 'si-card-head' },
          h('h2', { className: 'si-card-title' }, t('detail.pains')),
          h('span', { className: 'si-col-count' }, num(pains.length, locale)),
        ),
        pains.length === 0
          ? h('div', { className: 'si-empty' }, t('detail.noPains'))
          : h(
              'ul',
              { className: 'si-list' },
              pains.map((pain) =>
                h(
                  'li',
                  { className: `si-item ${pain.kind === 'tool' ? 'pain' : 'warn'}`, key: pain.id },
                  h(
                    'div',
                    { className: 'si-item-head' },
                    h('span', { className: 'si-item-name' }, pain.label),
                    h('span', { className: 'si-row-meta' }, `${num(pain.count, locale)}×`),
                  ),
                  pain.advice ? h('span', { className: 'si-item-body' }, pain.advice) : null,
                  pain.examples?.[0] ? h('span', { className: 'si-quote' }, pain.examples[0]) : null,
                ),
              ),
            ),
      )
    }

    function DuplicatesCard({ session, t, locale }) {
      const duplicates = session.duplicates ?? []
      return h(
        'section',
        { className: 'si-card' },
        h('h2', { className: 'si-card-title' }, t('detail.duplicates')),
        duplicates.length === 0
          ? h('div', { className: 'si-empty' }, t('detail.noDuplicates'))
          : h(
              'ul',
              { className: 'si-list' },
              duplicates.map((duplicate, index) =>
                h(
                  'li',
                  { className: 'si-item warn', key: `${duplicate.tool}-${index}` },
                  h(
                    'div',
                    { className: 'si-item-head' },
                    h('span', { className: 'si-item-name' }, duplicate.tool),
                    h('span', { className: 'si-row-meta' }, `${num(duplicate.count, locale)}×`),
                  ),
                  h('span', { className: 'si-code', title: duplicate.args }, duplicate.args || '—'),
                ),
              ),
            ),
      )
    }

    function ToolsCard({ session, t, locale }) {
      const tools = session.tools ?? []
      const max = tools.reduce((value, tool) => Math.max(value, tool.count ?? 0), 0) || 1
      return h(
        'section',
        { className: 'si-card' },
        h('h2', { className: 'si-card-title' }, t('detail.tools')),
        tools.length === 0
          ? h('div', { className: 'si-empty' }, t('detail.noTools'))
          : h(
              'div',
              { className: 'si-rows' },
              tools.slice(0, 10).map((tool) =>
                h(
                  'div',
                  { className: 'si-row', key: tool.name },
                  h(
                    'div',
                    { className: 'si-row-top' },
                    h('span', { className: 'si-row-name' }, tool.name),
                    h('span', { className: 'si-row-meta' }, `${num(tool.count, locale)} · ${pct(tool.share)}`),
                  ),
                  h(Bar, { ratio: (tool.count ?? 0) / max }),
                ),
              ),
            ),
      )
    }

    function renderMarkdown(text) {
      const blocks = []
      let list = null
      const inline = (line, keyPrefix) => {
        const nodes = []
        const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
        let last = 0
        let match = pattern.exec(line)
        let index = 0
        while (match) {
          if (match.index > last) nodes.push(line.slice(last, match.index))
          const token = match[0]
          if (token.startsWith('**')) nodes.push(h('strong', { key: `${keyPrefix}-b${index}` }, token.slice(2, -2)))
          else nodes.push(h('code', { key: `${keyPrefix}-c${index}` }, token.slice(1, -1)))
          last = pattern.lastIndex
          index += 1
          match = pattern.exec(line)
        }
        if (last < line.length) nodes.push(line.slice(last))
        return nodes
      }
      const lines = String(text ?? '').split(/\r?\n/)
      lines.forEach((raw, lineIndex) => {
        const line = raw.trimEnd()
        if (line.trim() === '') {
          if (list) {
            blocks.push(h('ul', { key: `list-${lineIndex}` }, list))
            list = null
          }
          return
        }
        const heading = /^(#{1,4})\s+(.*)$/.exec(line)
        if (heading) {
          if (list) {
            blocks.push(h('ul', { key: `list-${lineIndex}` }, list))
            list = null
          }
          blocks.push(h('h3', { key: `h-${lineIndex}` }, heading[2]))
          return
        }
        const bullet = /^[-*]\s+(.*)$/.exec(line)
        if (bullet) {
          list = list ?? []
          list.push(h('li', { key: `li-${lineIndex}` }, inline(bullet[1], `li-${lineIndex}`)))
          return
        }
        if (list) {
          blocks.push(h('ul', { key: `list-${lineIndex}` }, list))
          list = null
        }
        blocks.push(h('p', { key: `p-${lineIndex}` }, inline(line, `p-${lineIndex}`)))
      })
      if (list) blocks.push(h('ul', { key: 'list-tail' }, list))
      return blocks
    }

    function AuditPanel({ sessionId, t, locale, model, initial }) {
      const [state, setState] = useState(() =>
        initial && typeof initial.text === 'string' && initial.text !== ''
          ? {
              status: 'done',
              text: initial.text,
              meta: { modelName: initial.modelName, stats: initial.stats },
              savedAt: initial.at ?? null,
              saveError: null,
              error: null,
            }
          : { status: 'idle', text: '', meta: null, savedAt: null, saveError: null, error: null },
      )
      const controllerRef = useRef(null)
      const mountedRef = useRef(true)

      useEffect(() => {
        mountedRef.current = true
        return () => {
          // Deliberately keep the request alive: the Host writes a finished
          // audit to disk, so leaving the page must not throw the result away.
          // Only the explicit Stop button aborts.
          mountedRef.current = false
        }
      }, [])

      const start = useCallback(async () => {
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        setState({ status: 'running', text: '', meta: null, savedAt: null, saveError: null, error: null })
        try {
          const response = await fetch(`${API}/analyze`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-dsh-panel': 'session-insights' },
            body: JSON.stringify({ sessionId, locale }),
            signal: controller.signal,
          })
          if (!response.ok) {
            let detail = { message: `HTTP ${response.status}` }
            try {
              detail = await readJsonResponse(response)
            } catch {
              /* keep the status text */
            }
            throw Object.assign(new Error(detail.message || `HTTP ${response.status}`), { code: detail.code, next: detail.next })
          }
          await readNdjson(response, (line) => {
            if (!mountedRef.current) return
            if (line.type === 'meta') {
              setState((current) => ({ ...current, meta: line }))
            } else if (line.type === 'delta') {
              setState((current) => ({ ...current, text: current.text + line.text }))
            } else if (line.type === 'done') {
              setState((current) => ({
                ...current,
                status: 'done',
                savedAt: line.savedAt ?? null,
                saveError: line.saveError ?? null,
              }))
            } else if (line.type === 'error') {
              setState((current) => ({ ...current, status: 'error', error: line }))
            }
          })
          if (mountedRef.current) {
            setState((current) => (current.status === 'running' ? { ...current, status: 'done' } : current))
          }
        } catch (error) {
          if (!mountedRef.current || error?.name === 'AbortError') {
            if (mountedRef.current) setState((current) => ({ ...current, status: 'idle' }))
            return
          }
          setState((current) => ({
            ...current,
            status: 'error',
            error: { message: error?.message ?? String(error), code: error?.code },
          }))
        }
      }, [sessionId, locale])

      const stop = useCallback(() => {
        controllerRef.current?.abort()
        setState((current) => ({ ...current, status: 'idle' }))
      }, [])

      const running = state.status === 'running'
      const stats = state.meta?.stats
      return h(
        'section',
        { className: 'si-card' },
        h(
          'div',
          { className: 'si-card-head' },
          h('h2', { className: 'si-card-title' }, t('detail.audit')),
          h(
            'div',
            { className: 'si-row-actions' },
            running
              ? h('button', { type: 'button', className: 'si-btn', onClick: stop }, t('action.stop'))
              : h(
                  'button',
                  { type: 'button', className: 'si-btn primary', onClick: start, disabled: !model?.available },
                  state.status === 'error' ? t('action.retry') : t('action.audit'),
                ),
          ),
        ),
        h(
          'p',
          { className: 'si-note' },
          model?.available
            ? `${t('board.model')}：${model.name || model.model}`
            : `${t('board.model')}：${model ? t('board.modelMissing') : '…'}`,
        ),
        stats
          ? h('p', { className: 'si-note' }, format(t('detail.audit.input'), { requests: num(stats.requests, locale), calls: num(stats.toolCalls, locale), failures: num(stats.failures, locale) }))
          : null,
        running && state.text === ''
          ? h('div', { className: 'si-empty' }, h('span', { className: 'si-spin' }), ' ', t('detail.audit.running'))
          : null,
        state.text !== '' ? h('div', { className: 'si-audit-body' }, renderMarkdown(state.text)) : null,
        state.status === 'idle' && state.text === '' ? h('div', { className: 'si-empty' }, t('detail.audit.idle')) : null,
        state.error ? h(Banner, { title: state.error.code || t('error.title'), body: state.error.message, action: h('button', { type: 'button', className: 'si-btn', onClick: start }, t('action.retry')) }) : null,
        state.savedAt ? h('p', { className: 'si-note' }, format(t('detail.audit.saved'), { time: dateTime(state.savedAt, locale) })) : null,
        state.saveError ? h('p', { className: 'si-note' }, format(t('detail.audit.saveFailed'), { message: state.saveError })) : null,
        state.meta?.modelName && state.status === 'done' ? h('p', { className: 'si-note' }, format(t('detail.audit.by'), { model: state.meta.modelName })) : null,
      )
    }

    function SessionExhibits({ session, t, locale, onOpen }) {
      const exhibits = session.exhibits ?? []
      return h(
        'section',
        { className: 'si-card' },
        h(
          'div',
          { className: 'si-card-head' },
          h('h2', { className: 'si-card-title', style: { fontFamily: 'var(--si-serif)', letterSpacing: '.05em' } }, t('detail.exhibits')),
          h('span', { className: 'si-col-count' }, num(exhibits.length, locale)),
        ),
        h('p', { className: 'si-card-hint' }, t('detail.exhibits.hint')),
        exhibits.length === 0
          ? h('div', { className: 'si-empty' }, t('detail.exhibits.empty'))
          : h(
              'div',
              { className: 'si-mini-list' },
              exhibits.map((exhibit) =>
                h(
                  'button',
                  {
                    type: 'button',
                    key: exhibit.id,
                    className: 'si-mini',
                    onClick: () => onOpen?.(exhibit.id),
                  },
                  h(
                    'span',
                    { className: 'si-mini-head' },
                    h('span', { className: 'si-mini-no' }, format(t('museum.no'), { no: String(exhibit.no).padStart(3, '0') })),
                    h(
                      'span',
                      {
                        className: `si-badge${exhibit.outcome === 'fixed' ? ' ok' : exhibit.outcome === 'repeated' ? ' bad' : ''}`,
                      },
                      t(`museum.outcome.${exhibit.outcome}`),
                    ),
                  ),
                  h('span', { className: 'si-mini-title' }, exhibit.speciesLabel ?? exhibit.species),
                  h('span', { className: 'si-mini-meta' }, `${exhibit.tool || t('kind.turn')} · ${dateTime(exhibit.time, locale)}`),
                ),
              ),
            ),
      )
    }

    function Detail({ sessionId, model, t, locale, onBack, onGone, onOpenExhibit }) {
      const [state, setState] = useState({ status: 'loading', session: null, audit: null, error: null })
      useEffect(() => {
        const controller = new AbortController()
        let alive = true
        setState({ status: 'loading', session: null, audit: null, error: null })
        const readSession = fetch(`${API}/session?id=${encodeURIComponent(sessionId)}&locale=${locale}`, { signal: controller.signal })
          .then(async (response) => {
            const payload = await readJsonResponse(response)
            if (!response.ok || payload.ok === false) throw Object.assign(new Error(payload.message || `HTTP ${response.status}`), { code: payload.code })
            return payload.session
          })
        const readAudit = fetch(`${API}/audit?id=${encodeURIComponent(sessionId)}`, { signal: controller.signal })
          .then(readJsonResponse)
          .then((payload) => (payload?.ok ? payload.audit : null))
          .catch(() => null)
        Promise.all([readSession, readAudit])
          .then(([session, audit]) => {
            if (alive) setState({ status: 'ready', session, audit, error: null })
          })
          .catch((error) => {
            if (!alive || error?.name === 'AbortError') return
            // A Session that no longer reads must not become the restored view
            // forever: forget it so the next visit lands on the board.
            if (error?.code === 'SESSION_READ_FAILED') onGone?.()
            setState({ status: 'error', session: null, audit: null, error: { message: error?.message ?? String(error), code: error?.code } })
          })
        return () => {
          alive = false
          controller.abort()
        }
      }, [sessionId, locale])

      const session = state.session
      const title = session?.title || t('card.untitled')
      const statusTag = session
        ? h(
            'span',
            { className: `si-tag ${session.status === 'pain' ? 'bad' : session.status === 'redundant' ? 'warn' : 'ok'}` },
            session.status === 'pain' ? t('board.pain') : session.status === 'redundant' ? t('board.redundant') : t('board.ok'),
          )
        : null
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        session
          ? h(
              'section',
              { className: 'si-detail-hero' },
              h(
                'div',
                { className: 'si-actions' },
                h('button', { type: 'button', className: 'si-btn ghost', onClick: onBack }, `← ${t('action.back')}`),
                statusTag,
              ),
              h('h1', { className: 'si-detail-hero-title' }, title),
              h(
                'p',
                { className: 'si-detail-hero-sub' },
                [basename(session.cwd) || session.cwd || '', dateTime(session.createdAt, locale)].filter(Boolean).join(' · '),
              ),
              h(
                'div',
                { className: 'si-detail-hero-meta' },
                h('span', { className: 'si-badge' }, `${t('metric.requests')} ${num(session.userMessages, locale)}`),
                h('span', { className: 'si-badge' }, `${t('metric.calls')} ${num(session.toolCalls, locale)}`),
                session.toolFailures > 0
                  ? h('span', { className: 'si-badge bad' }, `${t('metric.fails')} ${num(session.toolFailures, locale)}`)
                  : null,
                session.redundantCalls > 0
                  ? h('span', { className: 'si-badge gold' }, `${t('metric.redundant')} ${num(session.redundantCalls, locale)}`)
                  : null,
                (session.exhibits?.length ?? 0) > 0
                  ? h('span', { className: 'si-badge' }, `${t('detail.exhibits')} ${num(session.exhibits.length, locale)}`)
                  : null,
              ),
            )
          : h(
              'div',
              { className: 'si-detail-head' },
              h('div', { className: 'si-actions' }, h('button', { type: 'button', className: 'si-btn ghost', onClick: onBack }, `← ${t('action.back')}`)),
            ),
        state.status === 'loading' ? h('div', { className: 'si-card' }, h('div', { className: 'si-empty' }, h('span', { className: 'si-spin' }), ' ', t('loading'))) : null,
        state.status === 'error' ? h(Banner, { title: t('error.title'), body: state.error?.message, action: h('button', { type: 'button', className: 'si-btn', onClick: onBack }, t('action.back')) }) : null,
        session
          ? h(
              'div',
              { className: 'si-detail-grid' },
              h(MetricsCard, { session, t, locale }),
              h(PainsEvidence, { session, t, locale }),
              h(DuplicatesCard, { session, t, locale }),
              h(ToolsCard, { session, t, locale }),
            )
          : null,
        session ? h(SessionExhibits, { session, t, locale, onOpen: onOpenExhibit }) : null,
        session
          ? h(AuditPanel, { key: session.id, sessionId: session.id, t, locale, model, initial: state.audit })
          : null,
        session && (session.requests?.length ?? 0) > 0
          ? h(
              'section',
              { className: 'si-card' },
              h('h2', { className: 'si-card-title' }, t('detail.requests')),
              h(
                'ul',
                { className: 'si-list' },
                session.requests.map((text, index) =>
                  h('li', { className: 'si-item', key: `req-${index}` }, h('span', { className: 'si-item-body' }, text)),
                ),
              ),
            )
          : null,
      )
    }

    // ------------------------------------------------------------------- page
    function Main(props) {
      const t = typeof props.t === 'function' ? props.t : translate
      const localeId = useActiveLocale()
      const locale = String(localeId || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh'
      const restored = useMemo(readUiState, [])
      const [days, setDays] = useState(() => {
        const value = Number(restored.days)
        return RANGES.includes(value) ? value : 30
      })
      const [view, setView] = useState(() =>
        restored.view === 'sessions' || restored.view === 'museum' ? restored.view : 'museum',
      )
      const [tick, setTick] = useState(0)
      const [openId, setOpenId] = useState(() =>
        typeof restored.sessionId === 'string' && restored.sessionId !== '' ? restored.sessionId : null,
      )
      const [exhibitId, setExhibitId] = useState(() =>
        typeof restored.exhibitId === 'string' && restored.exhibitId !== '' ? restored.exhibitId : null,
      )
      const [species, setSpecies] = useState(() => (typeof restored.species === 'string' ? restored.species : null))
      const [onlyReflected, setOnlyReflected] = useState(() => restored.onlyReflected === true)
      const [limits, setLimits] = useState(() =>
        restored.limits && typeof restored.limits === 'object' && !Array.isArray(restored.limits) ? restored.limits : {},
      )
      const [report, setReport] = useState({ status: 'loading', data: null, error: null })
      const [model, setModel] = useState(null)

      useEffect(() => {
        writeUiState({ days })
      }, [days])
      useEffect(() => {
        writeUiState({ sessionId: openId })
      }, [openId])
      useEffect(() => {
        writeUiState({ view, exhibitId, species, onlyReflected, limits })
      }, [view, exhibitId, species, onlyReflected, limits])

      useEffect(() => {
        const controller = new AbortController()
        setReport({ status: 'loading', data: null, error: null })
        fetch(`${API}/report?days=${days}&locale=${locale}${tick > 0 ? '&refresh=1' : ''}`, { signal: controller.signal })
          .then(async (response) => {
            const payload = await readJsonResponse(response)
            if (!response.ok || payload.ok === false) throw Object.assign(new Error(payload.message || `HTTP ${response.status}`), { code: payload.code })
            return payload.report
          })
          .then((data) => setReport({ status: 'ready', data, error: null }))
          .catch((error) => {
            if (error?.name === 'AbortError') return
            setReport({ status: 'error', data: null, error: { message: error?.message ?? String(error), code: error?.code } })
          })
        return () => controller.abort()
      }, [days, locale, tick])

      useEffect(() => {
        const controller = new AbortController()
        fetch(`${API}/model`, { signal: controller.signal })
          .then(readJsonResponse)
          .then((payload) => setModel(payload?.ok ? payload : { available: false }))
          .catch(() => setModel({ available: false }))
        return () => controller.abort()
      }, [])

      const data = report.data
      const totals = data?.totals
      const museum = data?.museum
      const stats = museum?.stats
      const sessionsSubtitle = totals
        ? format(t('page.subtitle'), {
            days,
            sessions: num(totals.sessions, locale),
            calls: num(totals.toolCalls, locale),
            failureRate: pct(totals.failureRate),
            redundancyRate: pct(totals.redundancyRate),
          })
        : t('loading')
      const museumSubtitle = stats
        ? format(t('museum.subtitle'), {
            days,
            exhibits: num(stats.exhibits, locale),
            sessions: num(stats.sessions, locale),
            recovery: pct(stats.recoveryRate),
            reflection: pct(stats.reflectionRate),
          })
        : t('museum.loading')

      const openSession = (id) => {
        setExhibitId(null)
        setView('sessions')
        setOpenId(id)
      }
      const switchView = (next) => {
        setExhibitId(null)
        setOpenId(null)
        setView(next)
      }

      const activeExhibit = exhibitId ? (museum?.exhibits ?? []).find((item) => item.id === exhibitId) ?? null : null

      return h(
        'div',
        { className: 'si-root' },
        h(StyleTag),
        h(
          'div',
          { className: 'si-wrap' },
          h(
            'header',
            { className: 'si-museum-head' },
            h(
              'div',
              { className: 'si-museum-title-row' },
              h(
                'div',
                { className: 'si-museum-name' },
                h('h1', null, t('panel.title')),
                t('panel.title') === t('museum.latin') || locale === 'en' ? null : h('span', { className: 'si-museum-latin' }, t('museum.latin')),
              ),
              h(
                'div',
                { className: 'si-actions' },
                h(
                  'div',
                  { className: 'si-tabs', role: 'tablist', 'aria-label': t('panel.title') },
                  ['museum', 'sessions'].map((id) =>
                    h(
                      'button',
                      {
                        key: id,
                        type: 'button',
                        role: 'tab',
                        'aria-pressed': view === id,
                        onClick: () => switchView(id),
                      },
                      t(`view.${id}`),
                    ),
                  ),
                ),
                h(
                  'div',
                  { className: 'si-seg', role: 'group', 'aria-label': t('range.label') },
                  RANGES.map((value) =>
                    h(
                      'button',
                      {
                        key: value,
                        type: 'button',
                        'aria-pressed': days === value,
                        onClick: () => setDays(value),
                      },
                      format(t('range.days'), { n: value }),
                    ),
                  ),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'si-btn',
                    onClick: () => setTick((value) => value + 1),
                    disabled: report.status === 'loading',
                  },
                  report.status === 'loading' ? t('loading') : t('action.refresh'),
                ),
              ),
            ),
            h('p', { className: 'si-museum-tagline' }, t('museum.tagline')),
            h('div', { className: 'si-ornament', 'aria-hidden': true }, h('i')),
            h('p', { className: 'si-sub', style: { margin: '9px 0 0' } }, view === 'museum' ? museumSubtitle : sessionsSubtitle),
            data?.scope
              ? h(
                  'p',
                  { className: 'si-note', style: { margin: '3px 0 0' } },
                  format(t('page.cache'), {
                    reused: num(data.scope.reused, locale),
                    read: num(data.scope.read, locale),
                    ms: num(data.scope.elapsedMs, locale),
                  }),
                )
              : null,
          ),
          exhibitId
            ? h(ExhibitDetail, {
                exhibit: activeExhibit,
                t,
                locale,
                onBack: () => setExhibitId(null),
                onOpenSession: openSession,
              })
            : openId
              ? h(Detail, {
                  sessionId: openId,
                  model,
                  t,
                  locale,
                  onBack: () => setOpenId(null),
                  onGone: () => setOpenId(null),
                  onOpenExhibit: (id) => {
                    setOpenId(null)
                    setView('museum')
                    setExhibitId(id)
                  },
                })
              : h(
                  React.Fragment,
                  null,
                  report.status === 'loading'
                    ? h(
                        'div',
                        { className: 'si-card' },
                        h('div', { className: 'si-empty' }, h('span', { className: 'si-spin' }), ' ', t('loading')),
                        h('p', { className: 'si-note' }, t('loading.hint')),
                      )
                    : null,
                  report.status === 'error'
                    ? h(Banner, {
                        title: t('error.title'),
                        body: report.error?.message,
                        action: h('button', { type: 'button', className: 'si-btn', onClick: () => setTick((value) => value + 1) }, t('action.retry')),
                      })
                    : null,
                  data && view === 'museum'
                    ? h(
                        React.Fragment,
                        null,
                        museum ? h(MuseumStats, { museum, t, locale }) : null,
                        museum ? h(DailyCurve, { museum, t, locale }) : null,
                        museum && (museum.species?.length ?? 0) > 0
                          ? h(
                              'section',
                              { className: 'si-note-card' },
                              h(
                                'div',
                                { className: 'si-card-head' },
                                h('h2', { style: { margin: 0 } }, t('museum.species.title')),
                                h(
                                  'button',
                                  {
                                    type: 'button',
                                    className: 'si-btn ghost',
                                    'aria-pressed': onlyReflected,
                                    onClick: () => setOnlyReflected((value) => !value),
                                  },
                                  `◈ ${t('museum.filter.reflect')}`,
                                ),
                              ),
                              h('p', { className: 'si-card-hint', style: { margin: 0 } }, t('museum.species.hint')),
                              h(SpeciesWall, { museum, active: species, onPick: setSpecies, t, locale }),
                              (species || onlyReflected) && museum
                                ? h(
                                    'button',
                                    { type: 'button', className: 'si-btn', style: { alignSelf: 'flex-start' }, onClick: () => { setSpecies(null); setOnlyReflected(false) } },
                                    t('museum.filter.reset'),
                                  )
                                : null,
                            )
                          : null,
                        museum ? h(HallBoard, { museum, activeSpecies: species, onlyReflected, t, locale, onOpen: setExhibitId, limits, setLimits }) : null,
                        museum ? h(CuratorNotes, { museum, t }) : null,
                      )
                    : null,
                  data && view === 'sessions'
                    ? h(
                        React.Fragment,
                        null,
                        h(
                          'div',
                          { className: 'si-plaques' },
                          h(Plaque, { label: t('kpi.sessions'), value: num(totals.sessions, locale), foot: `${num(totals.activeSessions, locale)} ${t('kpi.active')}` }),
                          h(Plaque, { label: t('kpi.calls'), value: num(totals.toolCalls, locale), foot: `${num(totals.steps, locale)} ${t('metric.steps')}` }),
                          h(Plaque, { label: t('kpi.failures'), value: num(totals.toolFailures, locale), foot: `${t('kpi.failureRate')} ${pct(totals.failureRate)}`, tone: 'bad' }),
                          h(Plaque, { label: t('kpi.redundant'), value: num(totals.redundantCalls, locale), foot: `${t('kpi.redundancyRate')} ${pct(totals.redundancyRate)}`, tone: 'warn' }),
                          h(Plaque, { label: t('kpi.requests'), value: num(totals.userMessages, locale), foot: `${t('kpi.perRequest')} ${num(totals.callsPerUserMessage, locale)}` }),
                          h(Plaque, { label: t('kpi.aborted'), value: num(totals.abortedTurns, locale), foot: `${num(totals.approvalsDenied, locale)} ${t('metric.denied')}` }),
                        ),
                        h('div', { className: 'si-cols' }, h(PainsCard, { report: data, t, locale }), h(FlowsCard, { report: data, t, locale })),
                        h(Board, { report: data, t, locale, onOpen: setOpenId, limits, setLimits }),
                        (data.warnings?.length ?? 0) > 0
                          ? h('p', { className: 'si-note' }, `${data.warnings.length} × ${data.warnings[0].code}: ${data.warnings[0].message}`)
                          : null,
                      )
                    : null,
                ),
        ),
      )
    }

    function PanelIcon({ size }) {
      return h(InsightsIcon, { size: typeof size === 'number' ? size : 18 })
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        appCtx = ctx
        ctx.effect(() => ctx.locale.register(NS, { zh: DICT.zh, en: DICT.en }), 'dsh-session-insights: dictionaries')
        translate = ctx.locale.bind(NS)
        const label = () => translate('panel.title')
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: 'session-insights', order: 40, label, locale: NS },
            PanelIcon,
          ),
        )
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'session-insights', locale: NS }, Main))
      },
    }
  },
})
