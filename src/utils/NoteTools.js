/**
 * NoteTools - Utilities for dynamic content processing and tool generation in notes
 */

/**
 * Builds a set of tools for note editing and manipulation
 * @param {Object} options - Configuration options
 * @returns {Array} Array of available tools
 */
export const buildTools = (options = {}) => {
  const { 
    handleGifAddition, 
    handleImageUpload, 
    handleTableInsert,
    handleCodeBlockInsert,
    handleChecklistInsert
  } = options;

  const tools = [
    {
      id: 'image',
      name: 'Insert Image',
      icon: 'image',
      action: handleImageUpload,
      description: 'Upload an image to your note'
    },
    {
      id: 'gif',
      name: 'Insert GIF',
      icon: 'gift',
      action: handleGifAddition,
      description: 'Add a GIF to your note'
    },
    {
      id: 'table',
      name: 'Insert Table',
      icon: 'grid',
      action: handleTableInsert,
      description: 'Insert a table into your note'
    },
    {
      id: 'code',
      name: 'Insert Code Block',
      icon: 'code',
      action: handleCodeBlockInsert,
      description: 'Insert a formatted code block'
    },
    {
      id: 'checklist',
      name: 'Insert Checklist',
      icon: 'check-square',
      action: handleChecklistInsert,
      description: 'Insert a checklist'
    }
  ];

  // Filter out tools with undefined actions
  return tools.filter(tool => typeof tool.action === 'function');
};

/**
 * Process dynamic content within notes
 * @param {string} content - The note content to process
 * @param {Object} options - Processing options
 * @returns {string} The processed content
 */
export const processDynamicContent = (content, options = {}) => {
  if (!content) return '';
  
  let processedContent = content;
  
  // Process checkbox items
  processedContent = processCheckboxes(processedContent);
  
  // Process automatic date replacements
  processedContent = processDateTokens(processedContent);
  
  // Process any other dynamic elements based on options
  if (options.processLinks) {
    processedContent = processLinks(processedContent);
  }
  
  return processedContent;
};

/**
 * Process checkbox items in content
 * @param {string} content - Content to process
 * @returns {string} Content with checkboxes processed
 */
const processCheckboxes = (content) => {
  // Replace [ ] with unchecked checkboxes and [x] with checked checkboxes
  return content
    .replace(/\[ \]/g, '<input type="checkbox" class="note-checkbox" />')
    .replace(/\[x\]/g, '<input type="checkbox" class="note-checkbox" checked />');
};

/**
 * Process date tokens in content
 * @param {string} content - Content to process
 * @returns {string} Content with date tokens processed
 */
const processDateTokens = (content) => {
  // Replace {{date}} with current date
  const today = new Date();
  const dateString = today.toLocaleDateString();
  
  return content.replace(/\{\{date\}\}/g, dateString);
};

/**
 * Process links in content
 * @param {string} content - Content to process
 * @returns {string} Content with links processed
 */
const processLinks = (content) => {
  // Simple URL regex - could be enhanced for better matching
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  return content.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}; 