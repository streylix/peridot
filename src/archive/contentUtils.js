const tempDiv = document.createElement('div');

export const getFirstLine = (content) => {
  if (!content) return 'Untitled';
  
  tempDiv.innerHTML = content;
  
  // Get all div elements
  const divs = tempDiv.getElementsByTagName('div');
  
  // If there are divs, get the first one's text content
  if (divs.length > 0) {
    const firstDivText = divs[0].textContent.trim();
    return firstDivText || 'Untitled';
  }
  
  // Fallback to first text content if no divs
  const text = tempDiv.textContent.trim();
  return text || 'Untitled';
};

export const getPreviewContent = (content) => {
  if (!content) return '';
  
  tempDiv.innerHTML = content;
  
  // Get all div elements
  const divs = Array.from(tempDiv.getElementsByTagName('div'));
  
  // Skip the first div (title) and get the rest
  if (divs.length > 1) {
    return divs
      .slice(1) // Skip first div
      .map(div => div.textContent.trim())
      .filter(text => text) // Remove empty strings
      .join(' ');
  }
  
  return '';
};