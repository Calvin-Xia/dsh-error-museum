/**
 * The plugin's durable state directory.
 *
 * This package used to be called `dsh-session-insights`. When it was renamed,
 * the digests and audits already on disk still sat in the old directory, so the
 * first store to load moves those two files into the new one: an upgrade must
 * not throw away a cached month of Session digests, nor an audit the user paid
 * a model request for.
 */

import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const STATE_DIR_NAME = 'dsh-error-museum'
const LEGACY_DIR_NAME = 'dsh-session-insights'
const STATE_FILES = ['digests.json', 'audits.json']

const home = () => process.env.DSH_HOME || join(homedir(), '.dsh')

let migration = null

export function stateDir() {
  return join(home(), STATE_DIR_NAME)
}

/** Create the state directory and, once per process, adopt the legacy files. */
export async function ensureStateDir() {
  const dir = stateDir()
  await fs.mkdir(dir, { recursive: true })
  migration ??= adoptLegacyFiles(dir)
  await migration
  return dir
}

async function adoptLegacyFiles(dir) {
  const legacy = join(home(), LEGACY_DIR_NAME)
  for (const name of STATE_FILES) {
    const target = join(dir, name)
    try {
      await fs.access(target)
      continue
    } catch {
      /* nothing at the new location yet */
    }
    try {
      await fs.rename(join(legacy, name), target)
    } catch {
      /* no legacy file, or it cannot be moved: start empty */
    }
  }
}
