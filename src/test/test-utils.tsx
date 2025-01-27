import React from 'react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Create a custom render function that includes common providers if needed
const customRender = (ui: React.ReactElement, options = {}) =>
  render(ui, {
    wrapper: ({ children }) => children,
    ...options,
  })

// Sample test data
export const mockNotes = [
  {
    id: 1,
    content: "Test Note 1",
    dateModified: new Date(2024, 0, 1).toISOString(),
    pinned: false,
    locked: false,
  },
  {
    id: 2,
    content: "Test Note 2",
    dateModified: new Date(2024, 0, 2).toISOString(),
    pinned: true,
    locked: false,
  },
  {
    id: 3,
    content: "Test Note 3",
    dateModified: new Date(2024, 0, 3).toISOString(),
    pinned: false,
    locked: true,
    tempPass: "password123"
  },
]

export * from '@testing-library/react'
export { customRender as render, userEvent }