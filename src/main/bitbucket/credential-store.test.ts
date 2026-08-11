import { chmodSync, existsSync, mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type * as Os from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tempHome = ''
const decryptStringMock = vi.fn((value: Buffer) => value.toString('utf-8'))

async function loadStore() {
  vi.resetModules()
  vi.doMock('electron', () => ({
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(value),
      decryptString: decryptStringMock
    }
  }))
  vi.doMock('node:os', async () => {
    const actual = await vi.importActual<typeof Os>('node:os')
    return { ...actual, homedir: () => tempHome }
  })
  return import('./credential-store')
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'orca-bitbucket-store-'))
  decryptStringMock.mockClear()
})

afterEach(() => {
  // A test chmods the .orca dir read-only; restore so cleanup can proceed.
  const dir = join(tempHome, '.orca')
  if (existsSync(dir)) {
    chmodSync(dir, 0o700)
  }
})

describe('Bitbucket credential store', () => {
  it('persists plaintext metadata and an encrypted secret, then reads them back', async () => {
    const store = await loadStore()
    store.saveBitbucketCredential({
      authMode: 'basic',
      email: 'ada@example.com',
      baseUrl: null,
      account: 'ada',
      accessToken: null,
      apiToken: 'secret-token'
    })

    expect(store.hasStoredBitbucketCredential()).toBe(true)
    expect(store.getStoredBitbucketMetadata()).toMatchObject({
      authMode: 'basic',
      email: 'ada@example.com',
      account: 'ada'
    })
    expect(store.loadStoredBitbucketSecret()).toEqual({
      accessToken: null,
      apiToken: 'secret-token'
    })
  })

  it('writes both credential files 0600', async () => {
    const store = await loadStore()
    store.saveBitbucketCredential({
      authMode: 'token',
      email: null,
      baseUrl: null,
      account: 'dev',
      accessToken: 'access-secret',
      apiToken: null
    })

    for (const file of ['bitbucket-credential.enc', 'bitbucket-credential.json']) {
      expect(statSync(join(tempHome, '.orca', file)).mode & 0o777).toBe(0o600)
    }
  })

  it('does not decrypt for metadata/status reads — only on a forced secret load', async () => {
    const store = await loadStore()
    store.saveBitbucketCredential({
      authMode: 'token',
      email: null,
      baseUrl: 'https://api.bitbucket.org/2.0',
      account: 'dev',
      accessToken: 'access-secret',
      apiToken: null
    })

    // Simulate a fresh session: caches cleared, files still on disk.
    store._resetBitbucketCredentialCache()

    expect(store.getStoredBitbucketMetadata()?.account).toBe('dev')
    expect(store.hasStoredBitbucketCredential()).toBe(true)
    expect(decryptStringMock).not.toHaveBeenCalled()

    // Without force, the secret stays unread.
    expect(store.loadStoredBitbucketSecret()).toBeNull()
    expect(decryptStringMock).not.toHaveBeenCalled()

    // Forcing the load decrypts exactly once, then caches.
    expect(store.loadStoredBitbucketSecret({ force: true })).toEqual({
      accessToken: 'access-secret',
      apiToken: null
    })
    expect(decryptStringMock).toHaveBeenCalledTimes(1)
    expect(store.loadStoredBitbucketSecret()).not.toBeNull()
    expect(decryptStringMock).toHaveBeenCalledTimes(1)
  })

  it('rejects non-string fields from hand-edited metadata and secret files', async () => {
    const store = await loadStore()
    const { writeFileSync } = await import('node:fs')
    store.saveBitbucketCredential({
      authMode: 'basic',
      email: 'ada@example.com',
      baseUrl: null,
      account: 'ada',
      accessToken: null,
      apiToken: 'secret-token'
    })

    writeFileSync(
      join(tempHome, '.orca', 'bitbucket-credential.json'),
      JSON.stringify({ version: 1, authMode: 'basic', email: { evil: true }, account: 42 })
    )
    writeFileSync(
      join(tempHome, '.orca', 'bitbucket-credential.enc'),
      JSON.stringify({ accessToken: ['nope'], apiToken: 7 })
    )
    store._resetBitbucketCredentialCache()

    expect(store.getStoredBitbucketMetadata()).toMatchObject({ email: null, account: null })
    expect(store.loadStoredBitbucketSecret({ force: true })).toEqual({
      accessToken: null,
      apiToken: null
    })
  })

  it('clears both files and in-memory state on disconnect', async () => {
    const store = await loadStore()
    store.saveBitbucketCredential({
      authMode: 'basic',
      email: 'ada@example.com',
      baseUrl: null,
      account: 'ada',
      accessToken: null,
      apiToken: 'secret-token'
    })

    store.clearStoredBitbucketCredential()

    expect(store.hasStoredBitbucketCredential()).toBe(false)
    expect(store.getStoredBitbucketMetadata()).toBeNull()
    expect(existsSync(join(tempHome, '.orca', 'bitbucket-credential.enc'))).toBe(false)
    expect(existsSync(join(tempHome, '.orca', 'bitbucket-credential.json'))).toBe(false)
  })

  it('surfaces a non-ENOENT delete failure instead of silently keeping the files', async () => {
    const store = await loadStore()
    store.saveBitbucketCredential({
      authMode: 'basic',
      email: 'ada@example.com',
      baseUrl: null,
      account: 'ada',
      accessToken: null,
      apiToken: 'secret-token'
    })

    // Read-only parent dir makes unlink fail with EACCES/EPERM. Clearing memory
    // while the files survive would resurrect the credential on next launch.
    chmodSync(join(tempHome, '.orca'), 0o500)
    expect(() => store.clearStoredBitbucketCredential()).toThrow()
    chmodSync(join(tempHome, '.orca'), 0o700)

    expect(existsSync(join(tempHome, '.orca', 'bitbucket-credential.enc'))).toBe(true)
  })
})
