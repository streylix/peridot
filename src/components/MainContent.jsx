import React, { useRef, useEffect } from 'react';

function MainContent({ note, onUpdateNote }) {
  const titleRef = useRef(null);
  const contentRef = useRef(null);

  // Only set initial content when switching notes
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.textContent = note?.title || '';
    }
    if (contentRef.current) {
      contentRef.current.innerHTML = note?.content || '';
    }
  }, [note?.id]);

  const handleTitleInput = () => {
    if (note && titleRef.current) {
      onUpdateNote({ title: titleRef.current.textContent });
    }
  };

  const handleTitleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      contentRef.current?.focus();
    }
  };

  const handleContentInput = () => {
    if (note && contentRef.current) {
      onUpdateNote({ content: contentRef.current.innerHTML });
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
      <div className="editable" style={{ height: '100%' }}>
        <h1
          ref={titleRef}
          contentEditable
          onInput={handleTitleInput}
          onKeyPress={handleTitleKeyPress}
          suppressContentEditableWarning
          style={{ marginBottom: '10px' }}
        />
        <div
          ref={contentRef}
          id="inner-note"
          contentEditable
          onInput={handleContentInput}
          suppressContentEditableWarning
          style={{ 
            height: 'calc(100% - 40px)',
            overflow: 'auto'
          }}
        />
      </div>
    </div>
  );
}

export default MainContent;