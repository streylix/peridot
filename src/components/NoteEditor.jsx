import React, { useRef, useEffect, useCallback } from 'react';
import { debounce } from '../utils/debounce';
import { noteContentService } from '../utils/NoteContentService';

function NoteEditor({ note, onUpdateNote, gifToAdd, onGifAdded }) {
  const contentRef = useRef(null);
  const previousContentRef = useRef('');

  // Debounced update function for content changes
  const debouncedUpdate = useCallback(
    debounce((content) => {
      if (content !== previousContentRef.current) {
        onUpdateNote({ content }, true);
        previousContentRef.current = content;
      }
    }, 10),
    [onUpdateNote]
  );

  useEffect(() => {
    if (gifToAdd && note && contentRef.current) {
      const gifEmbed = `<div><img src="${gifToAdd}" alt="GIF" style="max-width: 100%; height: auto;"></div>`;
      
      // Update content with GIF
      const newContent = note.content + gifEmbed;
      contentRef.current.innerHTML = newContent;
      
      // Trigger content update
      debouncedUpdate(newContent);
      
      // Reset gifToAdd
      onGifAdded(null);
      
      // Focus and move cursor to end
      contentRef.current.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(contentRef.current);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [gifToAdd, note, onGifAdded, debouncedUpdate]);

  const handleContentInput = useCallback(() => {
    if (note && contentRef.current) {
      const newContent = contentRef.current.innerHTML;
      debouncedUpdate(newContent);
    }
  }, [note, debouncedUpdate]);

  // Optimized caret position handler with debounce
  const handleSelect = useCallback(
    debounce(() => {
      if (!contentRef.current) return;
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        let charCount = 0;
        const treeWalker = document.createTreeWalker(
          contentRef.current,
          NodeFilter.SHOW_TEXT
        );
        let node;
        while ((node = treeWalker.nextNode()) && node !== range.startContainer) {
          charCount += node.length;
        }
        charCount += range.startOffset;
        onUpdateNote({ caretPosition: charCount }, false);
      }
    }, 10),
    [onUpdateNote]
  );

  useEffect(() => {
    if (contentRef.current && note) {
      // Update content
      contentRef.current.innerHTML = note.content || '';
      previousContentRef.current = note.content || '';
      
      // Set focus
      contentRef.current.focus();
      
      // Try to restore caret position
      if (note.caretPosition) {
        try {
          const selection = window.getSelection();
          const range = document.createRange();
          
          // Find position in content
          let currentPos = 0;
          let targetNode = null;
          let targetOffset = 0;
          
          function findPosition(node) {
            if (node.nodeType === Node.TEXT_NODE) {
              if (currentPos + node.length >= note.caretPosition) {
                targetNode = node;
                targetOffset = note.caretPosition - currentPos;
                return true;
              }
              currentPos += node.length;
            } else {
              for (let i = 0; i < node.childNodes.length; i++) {
                if (findPosition(node.childNodes[i])) {
                  return true;
                }
              }
            }
            return false;
          }
          
          findPosition(contentRef.current);
          
          if (targetNode) {
            range.setStart(targetNode, targetOffset);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } catch (e) {
          console.error('Error restoring caret position:', e);
        }
      }
    }
  }, [note?.id]);

  if (!note) {
    return (
      <div className="editable" placeholder="Select a note to start editing..." />
    );
  }

  return (
    <div className="editable">
      <div
        role='inner-note'
        ref={contentRef}
        id="inner-note"
        contentEditable
        onInput={handleContentInput}
        onSelect={handleSelect}
        suppressContentEditableWarning
      />
    </div>
  );
}

export default React.memo(NoteEditor);