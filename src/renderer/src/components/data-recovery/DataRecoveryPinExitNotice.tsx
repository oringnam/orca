import { useCallback, useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { RecoveryPointDto } from '../../../../shared/data-recovery'
import { DataRecoveryDialog } from './DataRecoveryDialog'
import {
  dismissPinExitNotice,
  isPinExitNoticeDismissed
} from './data-recovery-pin-exit-notice-dismissal'

function preV1Point(points: RecoveryPointDto[]): RecoveryPointDto | null {
  return points.find((point) => point.id === 'agent-catalog-pre-v1') ?? null
}

/** One-shot info banner after a successful agent-catalog pin: tells people how
 *  to leave for stable. Hidden when migration is blocked (red notice owns that
 *  state), when no pin exists, on paired web, or after dismiss for this pin. */
export function DataRecoveryPinExitNotice() {
  const [pin, setPin] = useState<RecoveryPointDto | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const status = await window.api.dataRecovery?.migrationStatus()
      if (status?.agentCatalogMigrationError != null) {
        setPin(null)
        return
      }
      const points = (await window.api.dataRecovery?.listPoints()) ?? []
      const next = preV1Point(points)
      setPin(next)
      setDismissed(next != null && isPinExitNoticeDismissed(next.createdAtMs))
    } catch {
      setPin(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (pin === null || dismissed) {
    return null
  }

  const handleDismiss = (): void => {
    dismissPinExitNotice(pin.createdAtMs)
    setDismissed(true)
  }

  return (
    <div role="status" className="border-b border-border bg-muted/40 py-2 text-sm">
      {/* Why: this strip sits under native macOS traffic lights; center the
          content block and reserve the same pad on both sides so the title is
          not clipped and reads as middle-of-window, not left-edge. */}
      <div className="flex items-start justify-center gap-3 px-3">
        <div className="titlebar-traffic-light-pad shrink-0" aria-hidden />
        <div className="flex min-w-0 max-w-3xl flex-1 flex-wrap items-start justify-center gap-2 sm:flex-nowrap">
          <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 text-left">
            <p className="font-medium">
              {translate(
                'auto.components.dataRecovery.pinExitTitle',
                'This profile was upgraded for custom agents'
              )}
            </p>
            <p className="text-muted-foreground">
              {translate(
                'auto.components.dataRecovery.pinExitBody',
                'Orca kept a recovery point so you can return to the previous Orca. Use Data recovery → Prepare downgrade, then install that older version. Do not only reinstall the older app over this profile. Going back discards settings and custom agents saved after the recovery point.'
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" size="xs" variant="outline" onClick={() => setRecoveryOpen(true)}>
              {translate('auto.components.dataRecovery.openDataRecovery', 'Open Data recovery')}
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={handleDismiss}>
              {translate('auto.components.dataRecovery.dismissPinExit', 'Got it')}
            </Button>
          </div>
        </div>
        <div className="titlebar-traffic-light-pad shrink-0" aria-hidden />
      </div>
      <DataRecoveryDialog open={recoveryOpen} onOpenChange={setRecoveryOpen} />
    </div>
  )
}
