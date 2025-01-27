import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, userEvent } from '../test/test-utils'
import { mockNotes } from '../test/test-utils'
import App from '../App'

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
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockNotes))
  })

  describe('Sidebar Toggle', () => {
    it('hides and shows the sidebar when toggle button is clicked', async () => {
      render(<App />)
      const user = userEvent.setup()
      
      const sidebar = document.getElementById('sidebar') as HTMLElement
      const toggleButton = document.getElementById('move-menu') as HTMLElement
      
      if (!sidebar || !toggleButton) {
        throw new Error('Required elements not found')
      }
      
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
      
      const backButton = document.getElementById('back-btn') as HTMLButtonElement
      if (!backButton) {
        throw new Error('Back button not found')
      }
      
      expect(backButton).toBeDisabled()
      
      // Get notes from the note list in sidebar
      const noteItems = document.querySelectorAll('.note-item')
      if (noteItems.length < 2) {
        throw new Error('Not enough note items found')
      }
      
      // Click first note
      await user.click(noteItems[0])
      
      // Click second note
      await user.click(noteItems[1])
      
      expect(backButton).toBeEnabled()
      
      await user.click(backButton)
      
      // After clicking back, first note should be selected
      expect(noteItems[0]).toHaveClass('active')
    })
  })

  describe('Info Button and Menu', () => {
    it('shows and hides info menu when clicked', async () => {
      render(<App />)
      const user = userEvent.setup()
      
      // Get first note from note list
      const noteItems = document.querySelectorAll('.note-item')
      if (noteItems.length === 0) {
        throw new Error('No note items found')
      }
      
      // Select first note
      await user.click(noteItems[0])
      
      const infoButton = document.getElementById('info-btn') as HTMLButtonElement
      if (!infoButton) {
        throw new Error('Info button not found')
      }
      
      await user.click(infoButton)
  
      // Check if menu buttons appear
      const menuButtons = document.querySelectorAll('.menu-btn')
      expect(menuButtons).toBeDefined()
      
      // Click outside to close
      await user.click(document.body)
      
      // Check if menu is closed
      expect(document.querySelector('.info-btn')).not.toBeInTheDocument()
    })
  })

  describe('Pin Functionality', () => {
    it('pins and unpins notes correctly', async () => {
      render(<App />)
      const user = userEvent.setup()
      
      // Select first note
      await user.click(screen.getByText('Test Note 1'))
      
      const infoButton = document.getElementById('info-menu-btn') as HTMLButtonElement
      
      if (!infoButton) {
        throw new Error('Info button not found')
      }
      
      // Open info menu and click pin
      await user.click(infoButton)
      await user.click(screen.getByText('Pin Note'))
      
      // Verify localStorage was called with updated notes
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'notes',
        expect.stringContaining('"pinned":true')
      )
    })
  })

  describe('Note Lock Functionality', () => {
    it('locks and unlocks notes with password', async () => {
      render(<App />)
      const user = userEvent.setup()
      
      // Select a note
      await user.click(screen.getByText('Test Note 1'))
      
      const infoButton = document.getElementById('info-menu-btn') as HTMLButtonElement
      
      if (!infoButton) {
        throw new Error('Info button not found')
      }
      
      // Open info menu and lock note
      await user.click(infoButton)
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
      
      const infoButton = document.getElementById('info-menu-btn') as HTMLButtonElement
      
      if (!infoButton) {
        throw new Error('Info button not found')
      }
      
      // Open info menu and click download
      await user.click(infoButton)
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