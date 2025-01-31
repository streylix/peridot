import { getFirstLine } from './contentUtils';

export const performDownload = (note) => {
  if (!note) return;

  const noteForExport = {
    id: note.id,
    content: note.content,
    dateModified: note.dateModified,
    pinned: note.pinned,
    locked: note.locked,
    tempPass: note.tempPass
  };

  const blob = new Blob([JSON.stringify(noteForExport, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const noteTitle = getFirstLine(note.content)
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase()
    .slice(0, 50);
  const fileName = `${noteTitle}.json`;

  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
