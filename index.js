/**
 * Host half of dsh-error-museum (错误博物馆 / The Error Museum).
 *
 * The bundle exists to answer three questions about the last N days of this
 * profile's Sessions: which errors keep coming back, what happened right before
 * and after each one, and how the model actually handled it (retry verbatim,
 * change course, hand it back, stall, or name its own mistake). This entry
 * wires the HTTP surface the panel page calls; all corpus work lives in
 * `src/host/`, scoring in `src/analysis.js` and the exhibit classifier in
 * `src/museum.js`.
 */

import { registerApi } from './src/host/api.js'
import { createAuditStore } from './src/host/audit-store.js'
import { createCorpus } from './src/host/corpus.js'
import { createDigestStore } from './src/host/digest-store.js'
import { createServiceAccess, normalizeConfig } from './src/host/services.js'

// The panel is a Web page: without a web server there is nothing to serve, and
// probing with ctx.get() at apply time is not enough — on a cold start the
// service may not be published yet, and the plugin would silently register no
// routes. Declaring the dependency makes Cordis run apply once it is ready.
export const inject = ['webServer']

export function apply(ctx, config) {
  const settings = normalizeConfig(config)
  const webServer = ctx.webServer
  if (!webServer || typeof webServer.register !== 'function') return

  // Services the handlers read are optional and resolved per request. Binding
  // them through ctx.inject (not ctx.get) is what makes them visible from this
  // plugin's scope once they are published.
  const access = createServiceAccess(ctx)
  access.bind(['sessionQuery', 'llm', 'agentDefaultModel', 'connection'])

  const corpus = createCorpus(access, settings, createDigestStore())
  const audits = createAuditStore()

  ctx.effect(
    () => {
      const disposers = registerApi(webServer, corpus, settings, audits, access)
      return () => {
        for (const dispose of disposers) {
          try {
            dispose?.()
          } catch {
            /* a route that is already gone is fine */
          }
        }
        corpus.clear()
      }
    },
    'dsh-error-museum: http api',
  )
}
