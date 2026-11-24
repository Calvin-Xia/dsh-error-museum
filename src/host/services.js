/**
 * Optional Host service access.
 *
 * Two things matter here, both learned the hard way:
 *  - A plain `ctx.get(name)` does not put a service into this plugin's scope,
 *    and on a cold start the service may not be published yet. Binding through
 *    `ctx.inject([name], scope => …)` waits for it and keeps a handle that
 *    stays valid across activation order.
 *  - Every dependency is optional: the panel must open in a profile without
 *    `sessionQuery` or `llm` and then say what is missing, instead of failing
 *    the whole profile's activation.
 */

/** A failure the HTTP layer can report verbatim, with one actionable next step. */
export function failure(code, message, next) {
  const error = new Error(message)
  error.code = code
  if (next) error.next = next
  return error
}

export function isFailure(error) {
  return Boolean(error) && typeof error.code === 'string' && typeof error.message === 'string'
}

/**
 * Bind a set of optional services and resolve them at call time.
 *
 * Each name gets its own `ctx.inject` call so one missing service never blocks
 * the others; `get` prefers the bound handle and only then falls back to a
 * direct lookup (for older Cordis without `ctx.inject`).
 */
export function createServiceAccess(ctx) {
  const handles = new Map()

  function bind(names) {
    if (typeof ctx.inject !== 'function') return
    for (const name of names) {
      try {
        ctx.inject([name], (scope) => {
          const value = scope[name] ?? null
          if (value) handles.set(name, value)
          return () => {
            if (handles.get(name) === value) handles.delete(name)
          }
        })
      } catch {
        /* a namespaced or unusual service cannot break activation */
      }
    }
  }

  function get(name) {
    const bound = handles.get(name)
    if (bound) return bound
    try {
      const value = ctx.get?.(name)
      if (value) return value
    } catch {
      /* an absent or inactive service is not an error here */
    }
    try {
      return ctx[name] ?? null
    } catch {
      return null
    }
  }

  return { bind, get }
}

/** Normalize what the patch row may pass as `config`, without a schema dependency. */
export function normalizeConfig(config) {
  const input = config && typeof config === 'object' ? config : {}
  const integer = (value, fallback, min, max) => {
    const number = Number(value)
    if (!Number.isFinite(number)) return fallback
    return Math.min(max, Math.max(min, Math.trunc(number)))
  }
  return {
    days: integer(input.days, 30, 1, 365),
    // Digest caching makes a whole-window read affordable; the time budget is
    // what actually bounds a cold first run.
    maxSessions: integer(input.maxSessions, 300, 1, 500),
    budgetMs: integer(input.budgetMs, 25_000, 2_000, 180_000),
    cacheMs: integer(input.cacheMs, 10 * 60_000, 5_000, 24 * 60 * 60_000),
    concurrency: integer(input.concurrency, 4, 1, 8),
  }
}
