import React, { useRef, useEffect } from 'react';

function MainContent({ note, onUpdateNote }) {
  const contentRef = useRef(null);

  useEffect(() => {
    if (contentRef.current && note) {
      contentRef.current.innerHTML = note.content || '';
      contentRef.current.focus();

      const savedPos = localStorage.getItem(`note-selection-${note.id}`);
      if (savedPos) {
        const pos = JSON.parse(savedPos);
        const range = document.createRange();
        const selection = window.getSelection();

        // Try to restore saved position
        try {
          const nodeIterator = document.createNodeIterator(contentRef.current, NodeFilter.SHOW_TEXT);
          let currentNode;
          let charCount = 0;

          while ((currentNode = nodeIterator.nextNode())) {
            if (charCount + currentNode.length >= pos.x) {
              range.setStart(currentNode, pos.x - charCount);
              selection.removeAllRanges();
              selection.addRange(range);
              break;
            }
            charCount += currentNode.length;
          }
        } catch (e) {
          // If restore fails, move to end
          range.setStart(textNode, offset);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          console.log("range: ", range)
          contentRef.current.focus();
        }
      } else {
        // Default to end of content
        const range = document.createRange();
        range.selectNodeContents(contentRef.current);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, [note?.id]);

  const handleSelect = () => {
    if (!contentRef.current) return;
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      let charCount = 0;
      const treeWalker = document.createTreeWalker(contentRef.current, NodeFilter.SHOW_TEXT);
      let node;

      while ((node = treeWalker.nextNode()) && node !== range.startContainer) {
        charCount += node.length;
      }
      charCount += range.startOffset;

      localStorage.setItem(`note-selection-${note.id}`, JSON.stringify({
        x: charCount
      }));
    }
  };

  const handleContentInput = () => {
    if (note && contentRef.current) {
      onUpdateNote({
        content: contentRef.current.innerHTML
      });
    }
  };

  if (!note) {
    return (
      <div className="main-content" style={{ visibility: 'hidden' }}>
        <div className="editable" placeholder="Select a note to start editing..." />
      </div>
    );
  }

  return (
    <div className="main-content">
      <div className="title-spacer" style={{ height: '40px' }} />
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
    </div>
  );
}

export default MainContent;