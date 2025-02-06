import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, userEvent } from '../test/test-utils'
import { mockNotes } from '../test/test-utils'
import App from '../App'

declare global {
  interface Navigator {
    storage: {
      getDirectory: () => Promise<FileSystemDirectoryHandle>;
    }
  }

  interface URL {
    createObjectURL: typeof URL.createObjectURL;
    revokeObjectURL: typeof URL.revokeObjectURL;
  }
}

// Mock OPFS directory handle
const mockFiles = new Map();
const mockNotesDir = {
  getFileHandle: vi.fn(async (name, { create } = { create: false }) => ({
    createWritable: vi.fn(async () => ({
      write: vi.fn(async (data) => mockFiles.set(name, data)),
      close: vi.fn()
    })),
    getFile: vi.fn(async () => ({
      text: async () => mockFiles.get(name)
    }))
  })),
  removeEntry: vi.fn(),
  entries: vi.fn(async function* () {
    for (const [name, content] of mockFiles) {
      yield [name, {
        getFile: async () => ({
          text: async () => content
        })
      }];
    }
  })
};

// Mock root directory should handle all types of files
const mockDirectoryHandle = {
  getDirectoryHandle: vi.fn(async () => mockNotesDir),
  getFileHandle: vi.fn(async (name, { create } = { create: false }) => ({
    createWritable: vi.fn(async () => ({
      write: vi.fn(async (data) => mockFiles.set(name, data)),
      close: vi.fn()
    })),
    getFile: vi.fn(async () => ({
      text: async () => mockFiles.get(name)
    }))
  }))
};

const mockStorage = {
  getDirectory: vi.fn(async () => mockDirectoryHandle)
}

Object.defineProperty(globalThis.navigator, 'storage', {
  value: mockStorage,
  writable: true
})

// Mock URL.createObjectURL and URL.revokeObjectURL
globalThis.URL.createObjectURL = vi.fn()
globalThis.URL.revokeObjectURL = vi.fn()

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

  // describe('Back Button', () => {
  //   it('enables back button after navigating between notes', async () => {
  //     render(<App />)
  //     const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      
  //     const noteItems = await screen.findAllByText(/Test Note/i)
  //     expect(noteItems.length).toBeGreaterThan(0)
      
  //     const backButton = document.getElementById('back-btn')
  //     expect(backButton).not.toBeNull()
  //     expect(backButton).toBeDisabled()
      
  //     // Find the actual note items in the sidebar
  //     const sidebar = document.querySelector('.sidebar')
  //     const noteElements = sidebar!.querySelectorAll('.note-item')
      
  //     // Click the notes in the sidebar
  //     await user.click(noteElements[0])
  //     await user.click(noteElements[1])
      
  //     expect(backButton).toBeEnabled()
      
  //     await user.click(backButton!)
  //     await vi.advanceTimersByTimeAsync(0)
      
  //     expect(noteElements[0]).toHaveClass('active')
  //   })
  // })

  // describe('Info Button and Menu', () => {
  //   it('shows and hides info menu when clicked', async () => {
  //     render(<App />)
  //     const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      
  //     const noteItems = await screen.findAllByText(/Test Note/i)
  //     await user.click(noteItems[0])
      
  //     const infoButton = document.getElementById('info-btn')
  //     expect(infoButton).not.toBeNull()
      
  //     await user.click(infoButton!)
  //     expect(await screen.findByText('Information')).toBeInTheDocument()
      
  //     await user.click(document.body)
  //     expect(screen.queryByText('Information')).not.toBeInTheDocument()
  //   })
  // })

  // describe('Pin Functionality', () => {
  //   it('pins and unpins notes correctly', async () => {
  //     render(<App />)
  //     const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      
  //     // Wait for initial notes to load
  //     const noteItems = await screen.findAllByText(/Test Note/i)
      
  //     // Click the last note (Test Note 1)
  //     await user.click(noteItems[2])
      
  //     // Open the menu
  //     const infoButton = document.getElementById('info-menu-btn')
  //     expect(infoButton).not.toBeNull()
  //     await user.click(infoButton!)
      
  //     // Find and click Pin Note button in menu
  //     const pinButton = await screen.findByRole('button', { 
  //       name: (name) => name.includes('Pin Note')
  //     })
  //     await user.click(pinButton)
      
  //     // Wait for all timers and promises
  //     await vi.advanceTimersByTimeAsync(1000)
  //     await new Promise(resolve => setTimeout(resolve, 0))
      
  //     // Verify note was saved with pinned status
  //     const savedNote = JSON.parse(mockFiles.get('1.json'))
  //     expect(savedNote.pinned).toBe(true)
  //   })
  // })

  // describe('Note Lock Functionality', () => {  
  //   it('locks and unlocks notes while preserving content', async () => {
  //     render(<App />)
  //     const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      
  //     // Find and click the first note
  //     await vi.advanceTimersByTimeAsync(100);
      
  //     await user.click(await screen.findByText(/Test Note 2/));
  //     await vi.advanceTimersByTimeAsync(100);
  
  //     const editor = await screen.findByRole('inner-note');
  //     await user.type(editor, '\nSecond note content test');
  //     expect(editor.textContent).toContain('Second note content test');
      
  //     await vi.advanceTimersByTimeAsync(100);
      
  //     // Open info menu and lock note
  //     const infoButton = screen.getByTestId('info-menu-btn');
  //     await user.click(infoButton);
      
  //     const lockButton = screen.getByText(/Lock Note/i);
  //     await user.click(lockButton)
      
      
  //     // Enter lock password
  //     const passwordInput = await screen.findByPlaceholderText(/Enter password/i);
  //     const confirmInput = await screen.findByPlaceholderText(/Confirm password/i);
      
  //     await user.type(passwordInput, 'test123');
  //     await user.type(confirmInput, 'test123');
  //     await user.click(screen.getByRole('button', { name: /^OK$/i }));

  //     // Checks if the locked window is there
  //     const isLocked = await screen.findByRole('inner-note');
  //     expect(!isLocked)
  //     const value = await screen.findAllByText(/password protected/);
  //     expect(value)
      
  //     await vi.advanceTimersByTimeAsync(1000);
      
  //     // Verify note is locked
  //     // const savedLockedNote = JSON.parse(mockFiles.get('2.json'));
  //     // expect(savedLockedNote.locked).toBe(true);
      
  //     // Unlock note
  //     await user.click(infoButton);
  //     const unlockButton = screen.getByText(/Unlock Note/i);
      
  //     // Enter unlock password
  //     const unlockPasswordInput = await screen.findByPlaceholderText(/Enter password/i);
      
  //     await user.type(unlockPasswordInput, 'test123');
  //     await user.keyboard('{Enter}');
      
  //     await vi.advanceTimersByTimeAsync(1000);

  //     // Check if the locked window is gone
  //     const isUnlocked = await screen.findByRole('inner-note');
  //     expect(isUnlocked)
      
  //     // // Verify note is unlocked and content is preserved
  //     // const savedUnlockedNote = JSON.parse(mockFiles.get('2.json'));
  //     // expect(savedUnlockedNote.locked).toBe(false);
  //   });
  // });

  // describe('Download Note Functionality', () => {
  //   it('downloads note as JSON when clicked', async () => {
  //     render(<App />)
  //     const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      
  //     const noteItems = await screen.findAllByText(/Test Note/i)
  //     await user.click(noteItems[0])
      
  //     const infoButton = document.getElementById('info-menu-btn')
  //     expect(infoButton).not.toBeNull()
      
  //     await user.click(infoButton!)
  //     await user.click(screen.getByText('Download Note'))
      
  //     expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
  //     expect(URL.revokeObjectURL).toHaveBeenCalled()
  //   })
  // })


  describe('Note Content Persistence', () => {
    it('preserves note content when navigating between notes', async () => {
      render(<App />);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await vi.advanceTimersByTimeAsync(100);
  
      // Click first note by text
      await user.click(await screen.findByText(/Test Note 2/));
      await vi.advanceTimersByTimeAsync(100);
  
      const editor = await screen.findByRole('inner-note');
      await user.type(editor, '\nFirst note content test');
      expect(editor.textContent).toContain('First note content test');
      await vi.advanceTimersByTimeAsync(1000);
  
      // Click second note
      await user.click(await screen.findByText(/Test Note 1/));
      await vi.advanceTimersByTimeAsync(100);
  
      const secondEditor = await screen.findByRole('inner-note');
      expect(secondEditor.textContent).not.toContain('First note content test');
      await vi.advanceTimersByTimeAsync(100);
  
      // Return to first note
      await user.click(await screen.findByText(/Test Note 2/));
      await vi.advanceTimersByTimeAsync(100);
  
      const firstEditor = await screen.findByRole('inner-note');
      expect(firstEditor.textContent).toContain('First note content test');
    });
  });
});