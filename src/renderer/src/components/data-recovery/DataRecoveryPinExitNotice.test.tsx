// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DataRecoveryPinExitNotice } from './DataRecoveryPinExitNotice'
import { dismissPinExitNotice } from './data-recovery-pin-exit-notice-dismissal'

const PIN = {
  id: 'agent-catalog-pre-v1' as const,
  compatibility: 'previous-binary' as const,
  createdAtMs: 1_752_000_000_000,
  sizeBytes: 1024
}

type ApiStub = {
  migrationStatus: ReturnType<typeof vi.fn>
  listPoints: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  retryAgentCatalogMigration: ReturnType<typeof vi.fn>
}

function installApi(overrides: Partial<ApiStub> = {}): ApiStub {
  const api: ApiStub = {
    migrationStatus: vi.fn().mockResolvedValue({ agentCatalogMigrationError: null }),
    listPoints: vi.fn().mockResolvedValue([PIN]),
    restore: vi.fn().mockResolvedValue({ ok: true }),
    retryAgentCatalogMigration: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides
  }
  ;(window as unknown as { api: unknown }).api = { dataRecovery: api }
  return api
}

describe('DataRecoveryPinExitNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('renders nothing when the dataRecovery surface is absent', async () => {
    ;(window as unknown as { api: unknown }).api = {}
    render(<DataRecoveryPinExitNotice />)
    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('renders nothing when migration is blocked', async () => {
    installApi({
      migrationStatus: vi.fn().mockResolvedValue({ agentCatalogMigrationError: 'disk full' })
    })
    render(<DataRecoveryPinExitNotice />)
    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('renders nothing when no recovery point exists', async () => {
    installApi({ listPoints: vi.fn().mockResolvedValue([]) })
    render(<DataRecoveryPinExitNotice />)
    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('shows exit guidance when a pin exists and migration is healthy', async () => {
    installApi()
    render(<DataRecoveryPinExitNotice />)
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.getByText('This profile was upgraded for custom agents')).toBeTruthy()
    expect(screen.getByText('Open Data recovery')).toBeTruthy()
  })

  it('dismisses for this pin and stays hidden after remount', async () => {
    installApi()
    const { unmount } = render(<DataRecoveryPinExitNotice />)
    fireEvent.click(await screen.findByText('Got it'))
    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    unmount()
    render(<DataRecoveryPinExitNotice />)
    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('reappears for a newer pin after a prior dismiss', async () => {
    dismissPinExitNotice(PIN.createdAtMs)
    installApi({
      listPoints: vi.fn().mockResolvedValue([{ ...PIN, createdAtMs: PIN.createdAtMs + 1 }])
    })
    render(<DataRecoveryPinExitNotice />)
    expect(await screen.findByRole('status')).toBeTruthy()
  })

  it('opens Data recovery from the banner', async () => {
    installApi()
    render(<DataRecoveryPinExitNotice />)
    fireEvent.click(await screen.findByText('Open Data recovery'))
    expect(
      await screen.findByText('Before the custom-agents update (agent catalog v1)')
    ).toBeTruthy()
  })
})
