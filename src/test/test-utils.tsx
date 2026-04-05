import React from 'react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const customRender = (ui: React.ReactElement, options = {}) =>
  render(ui, {
    wrapper: ({ children }) => children,
    ...options,
  })

export const mockNotes = [
  {
    id: 1,
    content: '<div>Test Note 1</div>',
    dateModified: new Date(2024, 0, 1).toISOString(),
    pinned: false,
    locked: false,
    encrypted: false,
    type: 'note',
    parentFolderId: null,
    visibleTitle: 'Test Note 1',
    previewContent: '',
    isOpen: false,
    caretPosition: null,
  },
  {
    id: 2,
    content: '<div>Test Note 2</div>',
    dateModified: new Date(2024, 0, 2).toISOString(),
    pinned: true,
    locked: false,
    encrypted: false,
    type: 'note',
    parentFolderId: null,
    visibleTitle: 'Test Note 2',
    previewContent: '',
    isOpen: false,
    caretPosition: null,
  },
  {
    id: 3,
    content: null,
    dateModified: new Date(2024, 0, 3).toISOString(),
    pinned: false,
    locked: true,
    encrypted: true,
    type: 'note',
    parentFolderId: null,
    visibleTitle: 'Test Note 3',
    previewContent: '',
    isOpen: false,
    caretPosition: null,
  },
]

export * from '@testing-library/react'
export { customRender as render, userEvent }
