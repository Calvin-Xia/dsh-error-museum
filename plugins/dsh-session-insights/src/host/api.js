/**
 * HTTP surface of the panel.
 *
 * The page is a browser page, so it reads through named routes on the Host's
 * web server. Every route is fenced: a cross-site request, a foreign Origin, or
 * a connection the Host's Connection service rejects never reaches the corpus.
 */

import { failure, isFailure } from './services.js'
import { buildSessionDigest } from '../digest.js'
import { auditSession, prepareModel, readSelection } from './model.js'

export const API_BASE = '/dsh-session-insights/api'
export const PANEL_HEADER = 'x-dsh-panel'
export const PANEL_TOKEN = 'session-insights'
const MAX_BODY_BYTES = 16 * 1024
const AUDIT_TIMEOUT_MS = 180_000

function sendJson(res, status, value) {
  if (res.writableEnded || res.destroyed) return
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function sendError(res, status, error) {
  const code = isFailure(error) ? error.code : 'INTERNAL_ERROR'
  const message = isFailure(error) ? error.message : String(error?.message ?? error)
  const next = isFailure(error) && error.next ? error.next : 'retry'
  sendJson(res, status, { ok: false, code, message, next })
}

function statusFor(error) {
  if (!isFailure(error)) return 500
  switch (error.code) {
    case 'SESSION_QUERY_UNAVAILABLE':
    case 'LLM_UNAVAILABLE':
    case 'MODEL_NOT_CONFIGURED':
    case 'MODEL_UNRESOLVED':
    case 'BUSY':
      return 503
    case 'SESSION_ID_REQUIRED':
    case 'BAD_REQUEST':
    case 'OUTPUT_TOO_LONG':
      return 400
    case 'AUDIT_ABORTED':
      return 499
    case 'MODEL_FAILED':
      return 502
    default:
      return 500
  }
}

function queryOf(req) {
  try {
    return new URL(req.url ?? '/', 'http://localhost').searchParams
  } catch {
    return new URLSearchParams()
  }
}

function localeOf(value) {
  return value === 'en' ? 'en' : 'zh'
}

function daysOf(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(365, Math.max(1, Math.trunc(number)))
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw failure('BAD_REQUEST', 'Request body is too large.', 'retry')
    chunks.push(buffer)
  }
  if (size === 0) return {}
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return value && typeof value === 'object' ? value : {}
  } catch {
    throw failure('BAD_REQUEST', 'Request body is not valid JSON.', 'retry')
  }
}

/** The fence every route shares. Returns a status code when the request is refused. */
export function createFence(access) {
  return function rejection(req) {
    const headers = req.headers ?? {}
    const site = headers['sec-fetch-site']
    if (site === 'cross-site') return 403
    const origin = headers.origin
    if (typeof origin === 'string' && origin !== 'null' && headers.host) {
      try {
        if (new URL(origin).host !== headers.host) return 403
      } catch {
        return 403
      }
    }
    const connection = access.get('connection')
    if (connection && typeof connection.requestRejection === 'function') {
      try {
        const code = connection.requestRejection(req)
        if (code === undefined || code === null || code === false) return undefined
        return typeof code === 'number' ? code : 403
      } catch {
        return 403
      }
    }
    return site === 'same-origin' || site === 'none' ? undefined : 403
  }
}

export function registerApi(webServer, corpus, config, audits, access) {
  const rejection = createFence(access)
  const pending = { audits: 0 }

  const register = (kind, path, handler) =>
    webServer.register({
      kind,
      path,
      handler(req, res) {
        const code = rejection(req)
        if (code) return sendJson(res, code, { ok: false, code: 'FORBIDDEN', message: 'Forbidden.', next: 'none' })
        return handler(req, res)
      },
    })

  async function reportHandler(req, res) {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Use GET.', next: 'none' })
    const query = queryOf(req)
    const controller = new AbortController()
    res.once?.('close', () => {
      if (!res.writableEnded) controller.abort()
    })
    try {
      const value = await corpus.report({
        days: daysOf(query.get('days'), config.days),
        locale: localeOf(query.get('locale')),
        refresh: query.get('refresh') === '1',
        signal: controller.signal,
      })
      sendJson(res, 200, { ok: true, report: value })
    } catch (error) {
      sendError(res, statusFor(error), error)
    }
  }

  async function sessionHandler(req, res) {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Use GET.', next: 'none' })
    const query = queryOf(req)
    try {
      const detail = await corpus.detail(query.get('id'), { locale: localeOf(query.get('locale')) })
      sendJson(res, 200, { ok: true, session: detail })
    } catch (error) {
      sendError(res, statusFor(error), error)
    }
  }

  async function modelHandler(req, res) {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Use GET.', next: 'none' })
    const controller = new AbortController()
    let timer = null
    try {
      const selection = await readSelection(access)
      if (!selection) {
        return sendJson(res, 200, {
          ok: true,
          available: false,
          reason: 'MODEL_NOT_CONFIGURED',
          message: 'No default model is configured for this profile.',
        })
      }
      timer = setTimeout(() => controller.abort(), 8000)
      timer.unref?.()
      const model = await prepareModel(access, controller.signal)
      sendJson(res, 200, {
        ok: true,
        available: true,
        provider: model.provider,
        model: model.model,
        name: model.name,
        resolved: model.resolved,
        reasoningEffort: model.reasoningEffort ?? null,
      })
    } catch (error) {
      if (isFailure(error) && error.code === 'LLM_UNAVAILABLE') {
        return sendJson(res, 200, { ok: true, available: false, reason: error.code, message: error.message })
      }
      sendError(res, statusFor(error), error)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async function auditHandler(req, res) {
    const query = queryOf(req)
    const id = String(query.get('id') ?? '')
    if (id === '') return sendJson(res, 400, { ok: false, code: 'SESSION_ID_REQUIRED', message: 'A session id is required.', next: 'pick_session' })
    try {
      if (req.method === 'GET') {
        const audit = await audits.get(id)
        return sendJson(res, 200, { ok: true, audit })
      }
      if (req.method === 'DELETE') {
        const removed = await audits.remove(id)
        return sendJson(res, 200, { ok: true, removed })
      }
      return sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Use GET or DELETE.', next: 'none' })
    } catch (error) {
      sendError(res, statusFor(error), error)
    }
  }

  async function analyzeHandler(req, res) {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Use POST.', next: 'none' })
    }
    if ((req.headers ?? {})[PANEL_HEADER] !== PANEL_TOKEN) {
      return sendJson(res, 403, { ok: false, code: 'FORBIDDEN', message: 'Audits must come from the panel.', next: 'none' })
    }
    if (pending.audits >= 2) {
      return sendError(res, 503, failure('BUSY', 'Two audits are already running; wait for one to finish.', 'retry'))
    }
    pending.audits += 1
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(failure('AUDIT_ABORTED', 'The audit timed out.', 'retry')), AUDIT_TIMEOUT_MS)
    timer.unref?.()
    const cancel = () => {
      if (!res.writableEnded) controller.abort(failure('AUDIT_ABORTED', 'The page closed the audit.', 'retry'))
    }
    res.once?.('close', cancel)

    let streaming = false
    const write = (value) => {
      if (res.writableEnded || res.destroyed) return
      res.write(`${JSON.stringify(value)}\n`)
    }
    try {
      const body = await readJsonBody(req)
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
      if (sessionId === '') throw failure('SESSION_ID_REQUIRED', 'A session id is required.', 'pick_session')
      const locale = localeOf(body.locale)
      const model = await prepareModel(access, controller.signal)
      const raw = await corpus.snapshot(sessionId)
      const { text: digest, stats } = buildSessionDigest(raw, { locale })
      controller.signal.throwIfAborted()

      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      })
      streaming = true
      write({ type: 'meta', provider: model.provider, model: model.model, modelName: model.name, sessionId, stats })
      const iterator = auditSession(model, { digest, locale, signal: controller.signal })[Symbol.asyncIterator]()
      let final = null
      for (;;) {
        controller.signal.throwIfAborted()
        const step = await iterator.next()
        if (step.done) {
          final = step.value
          break
        }
        write(step.value)
      }
      // A finished audit is worth a disk write: it survives a panel switch, a
      // page reload and an app restart. A save failure is reported, not fatal.
      let saved = null
      let saveError = null
      try {
        saved = await audits.put({
          sessionId,
          text: final?.text ?? '',
          at: Date.now(),
          provider: model.provider,
          model: model.model,
          modelName: model.name,
          stats,
        })
      } catch (error) {
        saveError = String(error?.message ?? error)
      }
      write({
        type: 'done',
        characters: final?.characters ?? 0,
        modelName: model.name,
        savedAt: saved?.at ?? null,
        saveError,
      })
      if (!res.writableEnded) res.end()
    } catch (error) {
      const code = isFailure(error) ? error.code : 'INTERNAL_ERROR'
      if (streaming) {
        write({
          type: 'error',
          code,
          message: isFailure(error) ? error.message : String(error?.message ?? error),
          next: isFailure(error) && error.next ? error.next : 'retry',
        })
        if (!res.writableEnded) res.end()
      } else {
        sendError(res, statusFor(error), error)
      }
    } finally {
      pending.audits -= 1
      clearTimeout(timer)
      res.removeListener?.('close', cancel)
    }
  }

  return [
    register('exact', `${API_BASE}/report`, reportHandler),
    register('exact', `${API_BASE}/session`, sessionHandler),
    register('exact', `${API_BASE}/audit`, auditHandler),
    register('exact', `${API_BASE}/model`, modelHandler),
    register('exact', `${API_BASE}/analyze`, analyzeHandler),
  ]
}
