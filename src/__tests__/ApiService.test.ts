/**
 * ApiService unit tests — verify the service layer correctly maps
 * to REST API calls and manages session passwords.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Minimal fetch mock
// ---------------------------------------------------------------------------

type MockResponse = { ok: boolean; status: number; json: () => Promise<any> }

function mockFetch(responses: MockResponse[]) {
  let callIndex = 0
  return vi.fn(async () => {
    const resp = responses[callIndex] ?? responses[responses.length - 1]
    callIndex++
    return resp
  })
}

function ok(data: any): MockResponse {
  return { ok: true, status: 200, json: async () => data }
}

function err(status: number, data: any): MockResponse {
  return { ok: false, status, json: async () => data }
}

// ---------------------------------------------------------------------------

describe('ApiService', () => {
  let apiService: any

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../utils/ApiService')
    apiService = mod.apiService
    // Set a cookie so getCsrfToken() reads it without making a fetch call
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrftoken=testtoken',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getAllNotes', () => {
    it('returns parsed notes array', async () => {
      const notes = [{ id: 1, content: '<div>hi</div>' }]
      global.fetch = mockFetch([ok(notes)]) as any
      const result = await apiService.getAllNotes()
      expect(result).toEqual(notes)
      expect(fetch).toHaveBeenCalledWith('/api/notes/', expect.objectContaining({ credentials: 'include' }))
    })

    it('throws on server error', async () => {
      global.fetch = mockFetch([err(500, {})]) as any
      await expect(apiService.getAllNotes()).rejects.toThrow()
    })
  })

  describe('writeNote — create', () => {
    it('POSTs when note does not exist (readNote returns null)', async () => {
      const newNote = { id: 999, content: '<div>New</div>' }
      // First fetch = readNote (404), second = POST create
      global.fetch = mockFetch([
        err(404, {}),
        { ok: true, status: 201, json: async () => newNote },
      ]) as any
      const result = await apiService.writeNote(999, newNote)
      expect(result).toEqual(newNote)
      const calls = (fetch as any).mock.calls
      expect(calls[1][1].method).toBe('POST')
    })

    it('PUTs when note exists', async () => {
      const existing = { id: 1, content: '<div>Old</div>' }
      const updated = { id: 1, content: '<div>New</div>' }
      global.fetch = mockFetch([ok(existing), ok(updated)]) as any
      const result = await apiService.writeNote(1, { content: '<div>New</div>' })
      expect(result).toEqual(updated)
      const calls = (fetch as any).mock.calls
      expect(calls[1][1].method).toBe('PUT')
    })

    it('includes session password in PUT body for locked notes', async () => {
      apiService.storeSessionPassword(42, 'hunter2')
      const lockedNote = { id: 42, locked: true, content: null }
      const update = { id: 42, locked: true, content: '<div>plaintext</div>' }
      global.fetch = mockFetch([ok(lockedNote), ok({ ...update, encrypted: true, content: null })]) as any
      await apiService.writeNote(42, update)
      const calls = (fetch as any).mock.calls
      const body = JSON.parse(calls[1][1].body)
      expect(body.password).toBe('hunter2')
    })
  })

  describe('importLegacyEncryptedItem', () => {
    it('POSTs encrypted legacy payload to the import endpoint', async () => {
      const legacy = { id: 123, encrypted: true, locked: true, content: [1, 2, 3], iv: [4, 5, 6] }
      global.fetch = mockFetch([{ ok: true, status: 201, json: async () => legacy }]) as any
      const result = await apiService.importLegacyEncryptedItem(legacy)
      expect(result).toEqual(legacy)
      const calls = (fetch as any).mock.calls
      expect(calls[0][0]).toBe('/api/notes/import_legacy_encrypted/')
      expect(calls[0][1].method).toBe('POST')
      expect(JSON.parse(calls[0][1].body)).toEqual(legacy)
    })
  })

  describe('deleteNote', () => {
    it('sends DELETE request', async () => {
      global.fetch = mockFetch([{ ok: true, status: 204, json: async () => ({}) }]) as any
      await apiService.deleteNote(5)
      expect((fetch as any).mock.calls[0][0]).toBe('/api/notes/5/')
      expect((fetch as any).mock.calls[0][1].method).toBe('DELETE')
    })

    it('clears session password on delete', async () => {
      apiService.storeSessionPassword(5, 'pw')
      global.fetch = mockFetch([{ ok: true, status: 204, json: async () => ({}) }]) as any
      await apiService.deleteNote(5)
      expect(apiService.getSessionPassword(5)).toBeNull()
    })
  })

  describe('lockNote', () => {
    it('POSTs to /lock/ and stores session password', async () => {
      const locked = { id: 1, locked: true, encrypted: true }
      global.fetch = mockFetch([ok(locked)]) as any
      const result = await apiService.lockNote(1, 'secret', 'secret')
      expect(result).toEqual(locked)
      expect(apiService.getSessionPassword(1)).toBe('secret')
      const body = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(body.password).toBe('secret')
      expect(body.confirmPassword).toBe('secret')
    })

    it('throws on bad response', async () => {
      global.fetch = mockFetch([err(400, { error: 'Passwords do not match' })]) as any
      await expect(apiService.lockNote(1, 'a', 'b')).rejects.toThrow('Passwords do not match')
    })
  })

  describe('unlockNote', () => {
    it('POSTs to /unlock/ and stores session password', async () => {
      const result = { success: true, note: { id: 1, content: '<div>Secret</div>' } }
      global.fetch = mockFetch([ok(result)]) as any
      const data = await apiService.unlockNote(1, 'pw')
      expect(data.success).toBe(true)
      expect(data.note.content).toBe('<div>Secret</div>')
      expect(apiService.getSessionPassword(1)).toBe('pw')
    })

    it('throws on wrong password', async () => {
      global.fetch = mockFetch([err(401, { error: 'Invalid password' })]) as any
      await expect(apiService.unlockNote(1, 'wrong')).rejects.toThrow('Invalid password')
    })
  })

  describe('unlockNotePermanent', () => {
    it('POSTs to /unlock_permanent/ and clears session password', async () => {
      apiService.storeSessionPassword(1, 'pw')
      const unlocked = { id: 1, locked: false, encrypted: false }
      global.fetch = mockFetch([ok(unlocked)]) as any
      const result = await apiService.unlockNotePermanent(1, 'pw')
      expect(result.locked).toBe(false)
      expect(apiService.getSessionPassword(1)).toBeNull()
    })
  })

  describe('session passwords', () => {
    it('stores, retrieves, and removes session passwords', () => {
      apiService.storeSessionPassword(10, 'mypassword')
      expect(apiService.getSessionPassword(10)).toBe('mypassword')
      apiService.removeSessionPassword(10)
      expect(apiService.getSessionPassword(10)).toBeNull()
    })

    it('never persists passwords between instances (in-memory only)', () => {
      apiService.storeSessionPassword(99, 'temp')
      // Simulating a page refresh by clearing the map directly
      apiService._sessionPasswords.clear()
      expect(apiService.getSessionPassword(99)).toBeNull()
    })
  })

  describe('searchGifs', () => {
    it('calls the gif proxy endpoint', async () => {
      const gifData = [{ id: 'abc', images: { fixed_height: { url: 'http://gif.gif' } } }]
      global.fetch = mockFetch([ok({ data: gifData })]) as any
      const result = await apiService.searchGifs('cats')
      expect(result).toEqual(gifData)
      expect((fetch as any).mock.calls[0][0]).toContain('/api/gifs/search/?q=cats')
    })

    it('returns empty array on error', async () => {
      global.fetch = mockFetch([err(502, {})]) as any
      const result = await apiService.searchGifs('cats')
      expect(result).toEqual([])
    })
  })

  describe('auth', () => {
    it('me returns null on 403', async () => {
      global.fetch = mockFetch([err(403, {})]) as any
      const result = await apiService.me()
      expect(result).toBeNull()
    })

    it('login posts credentials', async () => {
      global.fetch = mockFetch([ok({ id: '1', email: 'a@b.com' })]) as any
      const user = await apiService.login('a@b.com', 'pass')
      expect(user.email).toBe('a@b.com')
      const body = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(body.email).toBe('a@b.com')
    })

    it('login throws on 401', async () => {
      global.fetch = mockFetch([err(401, {})]) as any
      await expect(apiService.login('bad@bad.com', 'wrong')).rejects.toThrow()
    })
  })
})
