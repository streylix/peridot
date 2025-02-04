import { getFirstLine } from './contentUtils';
import html2pdf from 'html2pdf.js';

const jsonToText = (content) => {

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


const processContentForPdf = (htmlContent) => {
  // Remove HTML tags except for images
  let content = htmlContent;

  content = content.replace(/<\/div>/gi, '\n');
  content = content.replace(/<br\s*\/?>/gi, '');


  // Remove <div> tags but keep their content
  content = content.replace(/<\/?div>/gi, '');

  // Preserve image tags
  const images = [];
  let imgCount = 0;
  content = content.replace(/<img[^>]+>/gi, match => {
    images[imgCount] = match;
    return `__IMG${imgCount++}__`;
  });

  // Remove other HTML tags
  content = content.replace(/<[^>]+>/g, '');

  // Restore images
  images.forEach((img, i) => {
    content = content.replace(`__IMG${i}__`, img);
  });

  // Fix multiple spaces and clean up
  // content = content.replace(/\s+/g, ' ');

  return content;
};

const createPdfContent = (note, includeTitle = true) => {
  const container = document.createElement('div');

  if (includeTitle) {
    // Create header container
    const titleText = getFirstLine(note.content);
    const headerContainer = document.createElement('div');
    headerContainer.style.cssText = `
      margin-bottom: 12px;
    `;

    // Create title
    const titleElement = document.createElement('div');
    titleElement.textContent = titleText;
    titleElement.style.cssText = `
      font-size: 32px;
      font-weight: bold;
      color: #000000;
    `;

    headerContainer.appendChild(titleElement);
    container.appendChild(headerContainer);
  }

  const processedContent = processContentForPdf(note.content)
  const mainContent = processedContent

  // Create content container
  const contentContainer = document.createElement('div');
  contentContainer.style.cssText = `
    font-size: 16px;
    color: #000000;
    `;

  // Split into paragraphs and handle each
  const paragraphs = processedContent.split('\n');
  paragraphs.shift();
  
  paragraphs.forEach(para => {
    if (para.includes('<img')) {
      // Handle images
      const imgDiv = document.createElement('div');
      imgDiv.innerHTML = para;
      const images = imgDiv.getElementsByTagName('img');
      Array.from(images).forEach(img => {
        img.style.cssText = `
          max-width: 100%;
          height: auto;
          margin: 16px 0;
          display: block;
        `;
        img.crossOrigin = 'anonymous';
      });
      contentContainer.appendChild(imgDiv);
    } else if (para) {
      // Handle text paragraphs
      const p = document.createElement('div');
      p.textContent = para;
      contentContainer.appendChild(p);
    } else if (!para){
      contentContainer.appendChild(document.createElement('br'))
    }
  });

  container.appendChild(contentContainer);
  return container;
};

export const performDownload = async (note, fileType = 'json', pdfSettings = null) => {
  if (!note) return;

  const { mimeType, extension } = getFileTypeInfo(fileType);
  const noteTitle = getFirstLine(note.content);
  const fileName = `${noteTitle}.${extension}`;

  if (fileType === 'pdf' && pdfSettings) {
    try {
      const container = createPdfContent(note, pdfSettings.includeTitle);
      document.body.appendChild(container);
      
      const options = {
        margin: pdfSettings.margin,
        filename: fileName,
        image: { 
          type: 'jpeg', 
          quality: 1.0
        },
        html2canvas: { 
          scale: pdfSettings.scale,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        },
        jsPDF: { 
          unit: 'mm', 
          format: pdfSettings.pageSize, 
          orientation: pdfSettings.isLandscape ? 'landscape' : 'portrait'
        }
      };

      const worker = html2pdf().set(options).from(container);
      const pdfBlob = await worker.output('blob');
      document.body.removeChild(container);

      const pdfUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
      }, 100);

      return true;
    } catch (error) {
      console.error('Error generating PDF:', error);
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
      throw new Error('Failed to generate PDF');
    }
  }

  // Handle other file types (unchanged)...
  let content;
  switch (fileType) {
    case 'markdown':
    case 'text':
      content = jsonToText(note.content);
      break;
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
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};