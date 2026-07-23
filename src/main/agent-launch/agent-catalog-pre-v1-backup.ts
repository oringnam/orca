// Pinned pre-v1 backup writer injected into the agent-catalog v1 schema
// migration (src/shared/agent-catalog-schema-migration.ts). Kept in main
// because it is fs-bound; the migration itself is pure and shared with the CLI.

import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync
} from 'node:fs'
import type { PinnedBackupResult } from '../../shared/agent-catalog-schema-migration'

export function pinnedPreV1BackupPath(dataFile: string): string {
  return `${dataFile}.pre-agent-catalog-v1.backup`
}

/** Write the exact pre-v1 raw bytes to the pinned backup with the data file's
 *  permissions, fsync, then atomically rename into place. An existing pinned
 *  backup is kept (a crash between backup and first v1 write must not let a
 *  second attempt overwrite the original pre-v1 state). */
export function createPinnedPreV1Backup(dataFile: string, rawContents: string): PinnedBackupResult {
  const backupFile = pinnedPreV1BackupPath(dataFile)
  try {
    if (existsSync(backupFile)) {
      return { ok: true, created: false }
    }
    const mode = statSync(dataFile).mode & 0o777
    const tmpFile = `${backupFile}.tmp`
    const fd = openSync(tmpFile, 'w', mode)
    try {
      writeSync(fd, rawContents)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    try {
      renameSync(tmpFile, backupFile)
    } catch (error) {
      try {
        unlinkSync(tmpFile)
      } catch {
        // Best-effort tmp cleanup; the rename failure is the reported error.
      }
      throw error
    }
    return { ok: true, created: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
