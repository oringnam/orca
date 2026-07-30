// Why: after a successful agent-catalog v1 pin, show a one-shot exit path once
// so RC dogfooders know how to return to stable without reinstalling over live
// v1 data. Key by pin creation time so a later remigration (downgrade then
// re-open v1) re-surfaces the notice for the new pin.

const STORAGE_KEY = 'orca.dataRecovery.pinExitNotice.dismissedCreatedAtMs'

export function isPinExitNoticeDismissed(createdAtMs: number | null): boolean {
  if (createdAtMs === null) {
    return false
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return false
    }
    return Number(raw) === createdAtMs
  } catch {
    return false
  }
}

export function dismissPinExitNotice(createdAtMs: number | null): void {
  if (createdAtMs === null) {
    return
  }
  try {
    localStorage.setItem(STORAGE_KEY, String(createdAtMs))
  } catch {
    // localStorage may be unavailable; the notice remains dismissible for the session via state.
  }
}
