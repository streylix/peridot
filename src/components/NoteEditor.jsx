import React, { useRef, useEffect, useCallback } from 'react';
import { debounce } from '../utils/debounce';

function NoteEditor({ note, onUpdateNote }) {
  const contentRef = useRef(null);
  const previousContentRef = useRef('');

  // Debounced update function for content changes
  const debouncedUpdate = useCallback(
    debounce((content) => {
      if (content !== previousContentRef.current) {
        onUpdateNote({ content }, true);
        previousContentRef.current = content;
      }
    }, 100),
    [onUpdateNote]
  );

  // Optimized content input handler
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
    }, 150),
    [onUpdateNote]
  );

  useEffect(() => {
    if (contentRef.current && note) {
      contentRef.current.innerHTML = note.content || '';
      previousContentRef.current = note.content || '';
      contentRef.current.focus();

      // Set caret position
      if (note.caretPosition) {
        try {
          const nodeIterator = document.createNodeIterator(
            contentRef.current,
            NodeFilter.SHOW_TEXT
          );
          let currentNode;
          let charCount = 0;
          const range = document.createRange();
          const selection = window.getSelection();

          while ((currentNode = nodeIterator.nextNode())) {
            if (charCount + currentNode.length >= note.caretPosition) {
              range.setStart(currentNode, note.caretPosition - charCount);
              selection.removeAllRanges();
              selection.addRange(range);
              break;
            }
            charCount += currentNode.length;
          }
        } catch (e) {
          const range = document.createRange();
          range.selectNodeContents(contentRef.current);
          range.collapse(false);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
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