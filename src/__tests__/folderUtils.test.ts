import { describe, it, expect, vi, beforeEach } from 'vitest'

const writeNote = vi.fn()

vi.mock('../utils/ApiService.js', () => ({
  apiService: { writeNote },
}))

describe('FolderService.renameItem', () => {
  beforeEach(() => {
    writeNote.mockReset()
  })

  it('returns the saved folder with refreshed visibleTitle', async () => {
    const savedFolder = {
      id: 1,
      type: 'folder',
      content: 'New Folder',
      visibleTitle: 'New Folder',
      dateModified: '2026-05-11T00:00:00Z',
    }
    writeNote.mockResolvedValue(savedFolder)

    const { FolderService } = await import('../utils/folderUtils')
    const result = await FolderService.renameItem({
      id: 1,
      type: 'folder',
      content: 'Old Folder',
      visibleTitle: 'Old Folder',
      dateModified: '2026-05-10T00:00:00Z',
    }, 'New Folder')

    expect(writeNote).toHaveBeenCalledWith(1, expect.objectContaining({
      content: 'New Folder',
      visibleTitle: 'New Folder',
    }))
    expect(result).toBe(savedFolder)
  })

  it('preserves note body content when renaming a note', async () => {
    writeNote.mockImplementation(async (_id, item) => item)

    const { FolderService } = await import('../utils/folderUtils')
    const result = await FolderService.renameItem({
      id: 2,
      type: 'note',
      content: 'Old Title\nbody line',
      visibleTitle: 'Old Title',
    }, 'New Title')

    expect(result.content).toBe('New Title\nbody line')
    expect(result.visibleTitle).toBe('New Title')
  })
})
