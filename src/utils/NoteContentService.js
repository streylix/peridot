import html2pdf from 'html2pdf.js';

class NoteContentService {
  constructor() {
    this.tempDiv = document.createElement('div');
  }

  getFirstLine(content) {
    if (!content) return 'Untitled';
    this.tempDiv.innerHTML = content;
    const divs = this.tempDiv.getElementsByTagName('div');
    if (divs.length > 0) {
      const firstDivText = divs[0].textContent.trim();
      return firstDivText || 'Untitled';
    }
    const text = this.tempDiv.textContent.trim();
    return text || 'Untitled';
  }

  getPreviewContent(content) {
    if (!content) return '';
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
}

export const noteContentService = new NoteContentService();