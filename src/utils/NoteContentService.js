const looksLikeHtml = (s) => typeof s === 'string' && /<\w+[^>]*>/.test(s.trimStart().slice(0, 32));

const stripMdInline = (line) =>
  line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[image]')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`|\*|_)/g, '')
    .replace(/^\s*[-*+]\s+\[(?: |x|X)\]\s*/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+\.\s+/, '')
    .replace(/^\s*>\s?/, '')
    .trim();

const stripMdHeading = (line) => line.replace(/^\s*#{1,6}\s*/, '').trim();

class NoteContentService {
  constructor() {
    this.tempDiv = document.createElement('div');
  }

  getFirstLine(content) {
    if (!content) return 'Untitled';
    if (looksLikeHtml(content)) {
      this.tempDiv.innerHTML = content;
      const divs = this.tempDiv.getElementsByTagName('div');
      if (divs.length > 0) {
        const firstDivText = divs[0].textContent.trim();
        return firstDivText || 'Untitled';
      }
      const text = this.tempDiv.textContent.trim();
      return text || 'Untitled';
    }
    const lines = content.split('\n');
    for (const raw of lines) {
      const stripped = stripMdInline(stripMdHeading(raw));
      if (stripped) return stripped;
    }
    return 'Untitled';
  }

  getPreviewContent(content) {
    if (!content) return '';
    if (looksLikeHtml(content)) {
      this.tempDiv.innerHTML = content;
      const divs = Array.from(this.tempDiv.getElementsByTagName('div'));
      if (divs.length > 1) {
        return divs
          .slice(1)
          .map(div => div.textContent.trim())
          .filter(text => text)
          .join(' ');
      }
      return '';
    }
    const lines = content.split('\n');
    let foundFirst = false;
    const previewParts = [];
    for (const raw of lines) {
      const cleaned = stripMdInline(stripMdHeading(raw));
      if (!cleaned) continue;
      if (!foundFirst) { foundFirst = true; continue; }
      previewParts.push(cleaned);
    }
    return previewParts.join(' ');
  }
}

export const noteContentService = new NoteContentService();
