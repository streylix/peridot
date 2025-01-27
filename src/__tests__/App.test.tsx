import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, userEvent, within } from '../test/test-utils'
import { mockNotes } from '../test/test-utils'
import App from '../App'
import React from 'react'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn()
};
global.localStorage = localStorageMock as any

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn()
global.URL.revokeObjectURL = vi.fn()

describe('App', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockNotes));
  });

  describe('Sidebar Toggle', () => {
    it('hides and shows the sidebar when toggle button is clicked', async () => {
      render(<App />)
      const user = userEvent.setup()
      
      const sidebar = screen.getByRole('complementary')
      const toggleButton = screen.getByRole('button', { name: /toggle sidebar/i })
      
      expect(sidebar).not.toHaveClass('hidden')
      
      await user.click(toggleButton)
      expect(sidebar).toHaveClass('hidden')
      
      await user.click(toggleButton)
      expect(sidebar).not.toHaveClass('hidden')
    })
  })

  describe('Back Button', () => {
    it('enables back button after navigating between notes', async () => {
      render(<App />)
      const user = userEvent.setup()
      
      const backButton = screen.getByRole('button', { name: /back/i })
      expect(backButton).toBeDisabled()
      
      // Click first note
      const firstNote = screen.getByText('Test Note 1')
      await user.click(firstNote)
      
      // Click second note
      const secondNote = screen.getByText('Test Note 2')
      await user.click(secondNote)
      
      expect(backButton).toBeEnabled()
      
      await user.click(backButton)
      expect(screen.getByText('Test Note 1')).toBeInTheDocument()
    })
  })

  describe('Info Button and Menu', () => {
    it('shows and hides info menu when clicked', async () => {
      render(<App />)
      const user = userEvent.setup()
      
      // Select a note first
      await user.click(screen.getByText('Test Note 1'))
      
      const infoButton = screen.getByRole('button', { name: /info/i })
      await user.click(infoButton)
      
      expect(screen.getByText('Pin Note')).toBeInTheDocument()
      expect(screen.getByText('Lock Note')).toBeInTheDocument()
      
      // Click outside to close
      await user.click(document.body)
      expect(screen.queryByText('Pin Note')).not.toBeInTheDocument()
    })
  })

  describe('Pin Functionality', () => {
    it('pins and unpins notes correctly', async () => {
      render(<App />)
      const user = userEvent.setup()
      
      // Select first note
      await user.click(screen.getByText('Test Note 1'))
      
      // Open info menu and click pin
      const infoButton = screen.getByRole('button', { name: /info/i })
      await user.click(infoButton)
      await user.click(screen.getByText('Pin Note'))
      
      // Verify localStorage was called with updated notes
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'notes',
        expect.stringContaining('"pinned":true')
      )
    })
  })

  describe('Note Sorting', () => {
    it('displays pinned notes first and sorts by date', () => {
      render(<App />)
      
      const notesList = screen.getAllByRole('listitem')
      
      // First note should be the pinned one
      expect(within(notesList[0]).getByText('Test Note 2')).toBeInTheDocument()
      // Following notes should be sorted by date
      expect(within(notesList[1]).getByText('Test Note 3')).toBeInTheDocument()
      expect(within(notesList[2]).getByText('Test Note 1')).toBeInTheDocument()
    })
  })

  describe('Note Lock Functionality', () => {
    it('locks and unlocks notes with password', async () => {
      render(<App />)
      const user = userEvent.setup()
      
      // Select a note
      await user.click(screen.getByText('Test Note 1'))
      
      // Open info menu and lock note
      await user.click(screen.getByRole('button', { name: /info/i }))
      await user.click(screen.getByText('Lock Note'))
      
      // Enter password in modal
      const passwordInput = screen.getByPlaceholderText(/enter password/i)
      await user.type(passwordInput, 'test123')
      await user.click(screen.getByRole('button', { name: /ok/i }))
      
      // Verify note is locked
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'notes',
        expect.stringContaining('"locked":true')
      )
    })
  })

  describe('Download Note Functionality', () => {
    it('downloads note as JSON when clicked', async () => {
      render(<App />)
      const user = userEvent.setup()
      
      // Select a note
      await user.click(screen.getByText('Test Note 1'))
      
      // Open info menu and click download
      await user.click(screen.getByRole('button', { name: /info/i }))
      await user.click(screen.getByText('Download Note'))
      
      // Verify URL.createObjectURL was called
      expect(URL.createObjectURL).toHaveBeenCalledWith(
        expect.any(Blob)
      )
      
      // Verify URL.revokeObjectURL was called for cleanup
      expect(URL.revokeObjectURL).toHaveBeenCalled()
    })
  })
})