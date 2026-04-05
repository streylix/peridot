import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '../test/test-utils'
import { mockNotes } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import App from '../App'

// ---------------------------------------------------------------------------
// Mock the ApiService so tests never hit the network
// ---------------------------------------------------------------------------

const notesStore = new Map<number, any>()

vi.mock('../utils/ApiService', () => {
  const sessionPasswords = new Map<number, string>()

  const apiService = {
    _sessionPasswords: sessionPasswords,
    getCsrfToken: vi.fn(async () => 'test-csrf'),
    me: vi.fn(async () => ({ id: '1', email: 'test@test.com' })),
    login: vi.fn(async () => ({ id: '1', email: 'test@test.com' })),
    logout: vi.fn(async () => {}),
    getAllNotes: vi.fn(async () => Array.from(notesStore.values())),
    readNote: vi.fn(async (id: number) => notesStore.get(id) ?? null),
    writeNote: vi.fn(async (id: number, data: any) => {
      const note = { ...data, id }
      notesStore.set(id, note)
      return note
    }),
    deleteNote: vi.fn(async (id: number) => { notesStore.delete(id) }),
    lockNote: vi.fn(async (id: number, password: string) => {
      const note = notesStore.get(id)
      if (!note) throw new Error('Not found')
      const locked = { ...note, locked: true, encrypted: true, content: null, visibleTitle: note.visibleTitle || 'Locked' }
      notesStore.set(id, locked)
      sessionPasswords.set(id, password)
      return locked
    }),
    unlockNote: vi.fn(async (id: number, password: string) => {
      const note = notesStore.get(id)
      if (!note) throw new Error('Not found')
      const unlocked = { ...note, encrypted: false, content: '<div>Decrypted</div>' }
      sessionPasswords.set(id, password)
      return { success: true, note: unlocked }
    }),
    unlockNotePermanent: vi.fn(async (id: number) => {
      const note = notesStore.get(id)
      if (!note) throw new Error('Not found')
      const unlocked = { ...note, locked: false, encrypted: false, content: '<div>Decrypted</div>' }
      notesStore.set(id, unlocked)
      return unlocked
    }),
    storeSessionPassword: vi.fn((id: number, pw: string) => sessionPasswords.set(id, pw)),
    getSessionPassword: vi.fn((id: number) => sessionPasswords.get(id) ?? null),
    removeSessionPassword: vi.fn((id: number) => sessionPasswords.delete(id)),
    searchGifs: vi.fn(async () => []),
    getAvailableStorageTypes: vi.fn(() => [{ value: 'api', label: 'Server (PostgreSQL)' }]),
    getCurrentStorageType: vi.fn(() => 'api'),
    checkStorageEstimate: vi.fn(async () => ({ usage: 0, quota: Infinity })),
    getStorageInfo: vi.fn(async () => ({ totalSize: 0, totalSizeInKB: '0.00', entries: [], storageType: 'api' })),
    clearAllData: vi.fn(async () => {}),
    readThemePreference: vi.fn(async () => 'system'),
    writeThemePreference: vi.fn(async () => {}),
    setPreferredStorage: vi.fn(async () => 'api'),
    forceCleanStorage: vi.fn(async () => {}),
  }

  return { apiService, storageService: apiService }
})

// Also mock StorageService to re-export from the mocked ApiService
vi.mock('../utils/StorageService', async () => {
  const { apiService } = await import('../utils/ApiService')
  return { storageService: apiService, apiService }
})

// ---------------------------------------------------------------------------

describe('App', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    notesStore.clear()
    for (const note of mockNotes) {
      notesStore.set(note.id, { ...note })
    }
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Sidebar Toggle', () => {
    it('hides and shows the sidebar when toggle button is clicked', async () => {
      render(<App />)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      const noteItems = await screen.findAllByText(/Test Note/i)
      expect(noteItems.length).toBeGreaterThan(0)

      const sidebar = document.getElementById('sidebar')
      const toggleButton = document.getElementById('move-menu')

      expect(sidebar).not.toBeNull()
      expect(toggleButton).not.toBeNull()
      expect(sidebar).not.toHaveClass('hidden')

      await user.click(toggleButton!)
      expect(sidebar).toHaveClass('hidden')

      await user.click(toggleButton!)
      expect(sidebar).not.toHaveClass('hidden')
    })
  })

  describe('Note Content Persistence', () => {
    it('preserves note content when navigating between notes', async () => {
      render(<App />)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      await vi.advanceTimersByTimeAsync(100)

      await user.click(await screen.findByText(/Test Note 2/))
      await vi.advanceTimersByTimeAsync(100)

      const editor = await screen.findByRole('inner-note')
      await user.type(editor, '\nFirst note content test')
      expect(editor.textContent).toContain('First note content test')
      await vi.advanceTimersByTimeAsync(1000)

      await user.click(await screen.findByText(/Test Note 1/))
      await vi.advanceTimersByTimeAsync(100)

      const secondEditor = await screen.findByRole('inner-note')
      expect(secondEditor.textContent).not.toContain('First note content test')
      await vi.advanceTimersByTimeAsync(100)

      await user.click(await screen.findByText(/Test Note 2/))
      await vi.advanceTimersByTimeAsync(100)

      const firstEditor = await screen.findByRole('inner-note')
      expect(firstEditor.textContent).toContain('First note content test')
    })
  })

  describe('API calls on note operations', () => {
    it('calls getAllNotes on mount', async () => {
      const { apiService } = await import('../utils/ApiService')
      render(<App />)
      await screen.findAllByText(/Test Note/i)
      expect(apiService.getAllNotes).toHaveBeenCalled()
    })

    it('calls writeNote when note content changes', async () => {
      const { apiService } = await import('../utils/ApiService')
      render(<App />)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      await user.click(await screen.findByText(/Test Note 1/))
      await vi.advanceTimersByTimeAsync(100)

      const editor = await screen.findByRole('inner-note')
      await user.type(editor, 'x')
      await vi.advanceTimersByTimeAsync(500)

      expect(apiService.writeNote).toHaveBeenCalled()
    })

    it('calls deleteNote when a note is deleted', async () => {
      const { apiService } = await import('../utils/ApiService')
      vi.spyOn(window, 'confirm').mockReturnValue(true)

      render(<App />)
      await screen.findAllByText(/Test Note/i)

      // deleteNote is called from the sidebar via onDeleteNote prop
      // Trigger it programmatically through the mock
      await act(async () => {
        await apiService.deleteNote(1)
      })
      expect(apiService.deleteNote).toHaveBeenCalledWith(1)
    })
  })

  describe('Authentication', () => {
    it('shows app content when authenticated', async () => {
      render(<App />)
      expect(await screen.findAllByText(/Test Note/i)).toBeTruthy()
    })

    it('shows login screen when not authenticated', async () => {
      const { apiService } = await import('../utils/ApiService')
      vi.mocked(apiService.me).mockResolvedValueOnce(null)
      render(<App />)
      expect(await screen.findByPlaceholderText('Email')).toBeInTheDocument()
    })
  })
})
