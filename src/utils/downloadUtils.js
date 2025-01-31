import { getFirstLine } from './contentUtils';

const jsonToText = (content) => {
  console.log(content);

  content = content.replace(/<\/div>/gi, '\n');
  content = content.replace(/<br\s*\/?>/gi, '');

  let lines = content.split('\n');
  lines.shift(); // Remove the first line

  content = lines.join('\n');

  // Replace <img> tags with Markdown image syntax and remove style attributes
  content = content.replace(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)".*?>/gi, '\n\n![$2]($1)\n\n');

  // Remove <div> tags but keep their content
  content = content.replace(/<\/?div>/gi, '');

  return content;
};

const getFileTypeInfo = (fileType) => {
  const types = {
    json: { mimeType: 'application/json', extension: 'json' },
    markdown: { mimeType: 'text/markdown', extension: 'md' },
    text: { mimeType: 'text/plain', extension: 'txt' },
    pdf: { mimeType: 'application/pdf', extension: 'pdf' }
  };
  return types[fileType] || types.json;
};

export const performDownload = (note, fileType = 'json') => {
  if (!note) return;
  console.log(fileType)

  let content;
  const { mimeType, extension } = getFileTypeInfo(fileType);
  const noteTitle = getFirstLine(note.content)

  switch (fileType) {
    case 'markdown':
    case 'text':
      content = jsonToText(note.content);
      break;
    case 'pdf':
      // PDF conversion would go here - requires additional library
      console.warn('PDF conversion not yet implemented');
      return;
    case 'json':
    default:
      content = JSON.stringify({
        id: note.id,
        content: note.content,
        dateModified: note.dateModified,
        pinned: note.pinned,
        locked: note.locked,
        tempPass: note.tempPass
      }, null, 2);
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fileName = `${noteTitle}.${extension}`;

  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};