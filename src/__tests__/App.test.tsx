import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, userEvent } from '../test/test-utils'
import { mockNotes } from '../test/test-utils'
import App from '../App'

// Mock OPFS directory handle
const mockFiles = new Map()
const mockNotesDir = {
  getFileHandle: vi.fn(async (name, { create } = { create: false }) => {
    if (!mockFiles.has(name) && !create) {
      throw new Error('File not found')
    }
    
    const writeFunc = vi.fn(async (data) => {
      mockFiles.set(name, data)
    })
    
    const closeFunc = vi.fn(async () => {
      // Ensure write operation is complete
      await Promise.resolve()
    })
    
    return {
      createWritable: vi.fn(async () => ({
        write: writeFunc,
        close: closeFunc
      })),
      getFile: vi.fn(async () => ({
        text: async () => mockFiles.get(name)
      }))
    }
  }),
  removeEntry: vi.fn(async (name) => {
    mockFiles.delete(name)
  }),
  entries: vi.fn(async function* () {
    for (const [name, content] of mockFiles.entries()) {
      if (name.endsWith('.json')) {
        yield [name, {
          getFile: async () => ({
            text: async () => content
          })
        }]
      }
    }
  })
}

const mockDirectoryHandle = {
  getDirectoryHandle: vi.fn(async () => mockNotesDir)
}

const mockStorage = {
  getDirectory: vi.fn(async () => mockDirectoryHandle)
}

Object.defineProperty(global.navigator, 'storage', {
  value: mockStorage,
  writable: true
})

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn()
global.URL.revokeObjectURL = vi.fn()

describe('App', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockFiles.clear()
    
    // Initialize mock notes in OPFS
    for (const note of mockNotes) {
      const fileName = `${note.id}.json`
      mockFiles.set(fileName, JSON.stringify(note))
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

  describe('Back Button', () => {
    it('enables back button after navigating between notes', async () => {
      render(<App />)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      
      const noteItems = await screen.findAllByText(/Test Note/i)
      expect(noteItems.length).toBeGreaterThan(0)
      
      const backButton = document.getElementById('back-btn')
      expect(backButton).not.toBeNull()
      expect(backButton).toBeDisabled()
      
      // Find the actual note items in the sidebar
      const sidebar = document.querySelector('.sidebar')
      const noteElements = sidebar!.querySelectorAll('.note-item')
      
      // Click the notes in the sidebar
      await user.click(noteElements[0])
      await user.click(noteElements[1])
      
      expect(backButton).toBeEnabled()
      
      await user.click(backButton!)
      await vi.advanceTimersByTimeAsync(0)
      
      expect(noteElements[0]).toHaveClass('active')
    })
  })

  describe('Info Button and Menu', () => {
    it('shows and hides info menu when clicked', async () => {
      render(<App />)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      
      const noteItems = await screen.findAllByText(/Test Note/i)
      await user.click(noteItems[0])
      
      const infoButton = document.getElementById('info-btn')
      expect(infoButton).not.toBeNull()
      
      await user.click(infoButton!)
      expect(await screen.findByText('Information')).toBeInTheDocument()
      
      await user.click(document.body)
      expect(screen.queryByText('Information')).not.toBeInTheDocument()
    })
  })

  describe('Pin Functionality', () => {
    it('pins and unpins notes correctly', async () => {
      render(<App />)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      
      // Wait for initial notes to load
      const noteItems = await screen.findAllByText(/Test Note/i)
      
      // Click the last note (Test Note 1)
      await user.click(noteItems[2])
      
      // Open the menu
      const infoButton = document.getElementById('info-menu-btn')
      expect(infoButton).not.toBeNull()
      await user.click(infoButton!)
      
      // Find and click Pin Note button in menu
      const pinButton = await screen.findByRole('button', { 
        name: (name) => name.includes('Pin Note')
      })
      await user.click(pinButton)
      
      // Wait for all timers and promises
      await vi.advanceTimersByTimeAsync(1000)
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Verify note was saved with pinned status
      const savedNote = JSON.parse(mockFiles.get('1.json'))
      expect(savedNote.pinned).toBe(true)
    })
  })

  describe('Note Lock Functionality', () => {
    it('locks and unlocks notes with password', async () => {
      render(<App />)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      
      // Wait for initial notes to load and select first note
      const noteItems = await screen.findAllByText(/Test Note/i)
      await user.click(noteItems[2]) // Click "Test Note 1"
      
      // Open info menu using the element ID
      const infoButton = document.getElementById('info-menu-btn')
      expect(infoButton).not.toBeNull()
      await user.click(infoButton!)
      
      // Find and click Lock Note
      const lockButton = await screen.findByText(/^Lock Note$/)
      await user.click(lockButton)
      
      // Enter passwords
      const passwordInput = await screen.findByPlaceholderText(/enter password/i)
      const confirmInput = await screen.findByPlaceholderText(/confirm password/i)
      
      await user.type(passwordInput, 'test123')
      await user.type(confirmInput, 'test123')
      
      // Click OK button
      const okButton = await screen.findByRole('button', { name: /^OK$/i })
      await user.click(okButton)
      
      // Wait for debounced save operations
      await vi.advanceTimersByTimeAsync(1000)
      // Wait for any promises
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Verify the note is locked
      const savedNote = JSON.parse(mockFiles.get('1.json'))
      expect(savedNote.locked).toBe(true)
      expect(savedNote.tempPass).toBe('test123')
    })
  })

  describe('Download Note Functionality', () => {
    it('downloads note as JSON when clicked', async () => {
      render(<App />)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      
      const noteItems = await screen.findAllByText(/Test Note/i)
      await user.click(noteItems[0])
      
      const infoButton = document.getElementById('info-menu-btn')
      expect(infoButton).not.toBeNull()
      
      await user.click(infoButton!)
      await user.click(screen.getByText('Download Note'))
      
      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
      expect(URL.revokeObjectURL).toHaveBeenCalled()
    })
  })
})