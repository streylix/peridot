import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NoteItem from '../components/NoteItem';

describe('NoteItem', () => {
  it('uses visibleTitle for unlocked notes without mutating the note', () => {
    const note = {
      id: 1,
      content: 'I figured it out\nBody',
      locked: false,
      visibleTitle: '8/22/2024',
      pinned: false,
    };

    render(
      <NoteItem
        note={note}
        isSelected={false}
        onNoteSelect={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );

    expect(screen.getByText('8/22/2024')).toBeInTheDocument();
    expect(note.visibleTitle).toBe('8/22/2024');
  });
});
