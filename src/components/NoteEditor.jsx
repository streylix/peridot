import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin, ViewUpdate, Decoration } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { debounce } from '../utils/debounce';
import { RangeSetBuilder } from '@codemirror/rangeset';
import { syntaxTree } from '@codemirror/language';

//
// NEW: ViewPlugin to reveal formatting tokens under (or very near) the caret
//
const showFormattingOnCursorPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.buildDecorations(view);
  }
  update(update) {
    if (update.selectionSet || update.docChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }
  buildDecorations(view) {
    const builder = new RangeSetBuilder();
    const { from, to } = view.state.selection.main;
    // We iterate a bit beyond the selection to catch tokens adjacent to the caret.
    syntaxTree(view.state).iterate({
      from: Math.max(0, from - 50),
      to: to + 50,
      enter: (node) => {
        // Check if the node represents markdown formatting.
        // (Adjust the condition to match your language’s token names.)
        if (node.name.startsWith("Format") || node.name.startsWith("HeaderMark")) {
          // If the selection overlaps with this node, mark it to show formatting.
          if ((node.from <= from && node.to >= from) || (node.from <= to && node.to >= to)) {
            builder.add(node.from, node.to, Decoration.mark({ class: "cm-show-formatting" }));
          }
        }
      }
    });
    return builder.finish();
  }
}, {
  decorations: v => v.decorations,
});

function NoteEditor({ note, onUpdateNote, gifToAdd, onGifAdded }) {
  const editorRef = useRef();
  const editorViewRef = useRef(null);
  const [isDarkMode, setIsDarkMode] = useState(
    document.body.classList.contains('dark-mode')
  );
  const previousContentRef = useRef('');

  // Debounced update function for content changes
  const debouncedUpdate = useCallback(
    debounce((newContent) => {
      if (newContent !== previousContentRef.current) {
        onUpdateNote({ content: newContent }, true);
        previousContentRef.current = newContent;
      }
    }, 300),
    [onUpdateNote]
  );

  // Initialize editor when note changes
  useEffect(() => {
    if (!note) return;
    
    // Clean up previous editor instance
    if (editorViewRef.current) {
      editorViewRef.current.destroy();
    }

    // MODIFIED: Custom styling updated to hide markdown formatting by default
    // and to show larger headers.
    const customTheme = EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "16px",
      },
      ".cm-content": {
        fontFamily: "inherit",
        padding: "10px 0",
      },
      "&.cm-focused": {
        outline: "none",
      },
      ".cm-line": {
        padding: "0 4px",
      },
      ".cm-header": { fontWeight: "bold" },
      // NEW: Increase header sizes
      ".cm-header-1": { fontSize: "2em" },
      ".cm-header-2": { fontSize: "1.8em" },
      ".cm-header-3": { fontSize: "1.6em" },
      ".cm-header-4, .cm-header-5, .cm-header-6": { fontSize: "1.4em" },
      ".cm-strong": { fontWeight: "bold" },
      ".cm-em": { fontStyle: "italic" },
      ".cm-link": { textDecoration: "underline" },
      // NEW: Hide formatting syntax by default
      ".cm-formatting-header, .cm-formatting-strong, .cm-formatting-em, .cm-formatting-link, .cm-formatting-list-ul, .cm-formatting-list-ol, .cm-formatting-code, .cm-formatting-code-block": { 
        opacity: 0,
        transition: "opacity 0.2s ease",
      },
      // NEW: When our plugin marks a token, make it visible
      ".cm-show-formatting": {
        opacity: 1,
      },
      // Optional: Retain custom colors for formatting tokens
      ".cm-formatting-header": { color: isDarkMode ? "#61afef" : "#0366d6" },
      ".cm-formatting-strong": { color: isDarkMode ? "#e5c07b" : "#e36209" },
      ".cm-formatting-em": { color: isDarkMode ? "#c678dd" : "#6f42c1" },
      ".cm-formatting-link": { color: isDarkMode ? "#56b6c2" : "#032f62" },
      ".cm-formatting-list-ul, .cm-formatting-list-ol": { color: isDarkMode ? "#abb2bf" : "#24292e" },
      ".cm-formatting-code, .cm-formatting-code-block": { color: isDarkMode ? "#98c379" : "#2a9d8f" },
      ".cm-url": { color: isDarkMode ? "#56b6c2" : "#032f62" },
    });

    // List of extensions including our new formatting plugin.
    const extensions = [
      EditorView.lineWrapping,
      customTheme,
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
      syntaxHighlighting(defaultHighlightStyle),
      keymap.of([...defaultKeymap, indentWithTab]),
      // Custom checkbox handling
      EditorView.domEventHandlers({
        click: (event, view) => {
          // Check if the clicked element is inside a markdown checkbox
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos) {
            const line = view.state.doc.lineAt(pos);
            const checkboxMatch = line.text.match(/^(\s*[-*]\s+\[)([xX ])(])/);
            if (checkboxMatch) {
              const start = line.from + checkboxMatch[1].length;
              const newChar = checkboxMatch[2].toLowerCase() === 'x' ? ' ' : 'x';
              view.dispatch({
                changes: { from: start, to: start + 1, insert: newChar }
              });
              return true;
            }
          }
          return false;
        }
      }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          const newContent = update.state.doc.toString();
          debouncedUpdate(newContent);
        }
      }),
      // NEW: Add our plugin that reveals formatting tokens near the caret
      showFormattingOnCursorPlugin,
    ];

    // Add dark theme if needed
    if (isDarkMode) {
      extensions.push(oneDark);
    }

    // Initial editor state
    const startState = EditorState.create({
      doc: note.content || '',
      extensions
    });

    // Create editor view
    editorViewRef.current = new EditorView({
      state: startState,
      parent: editorRef.current,
    });

    previousContentRef.current = note.content || '';

    return () => {
      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
    };
  }, [note?.id, isDarkMode, debouncedUpdate]);

  // Listen for system dark mode changes
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.body.classList.contains('dark-mode'));
    };

    checkDarkMode();
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          checkDarkMode();
        }
      });
    });

    observer.observe(document.body, { attributes: true });

    return () => observer.disconnect();
  }, []);

  // Effect for gif insertion
  useEffect(() => {
    if (gifToAdd && note && editorViewRef.current) {
      const gifMarkdown = `\n![GIF](${gifToAdd})\n`;
      
      const transaction = editorViewRef.current.state.update({
        changes: {
          from: editorViewRef.current.state.doc.length,
          insert: gifMarkdown
        }
      });
      
      editorViewRef.current.dispatch(transaction);
      onGifAdded(null);
    }
  }, [gifToAdd, note, onGifAdded]);

  if (!note) {
    return (
      <div className="editable" placeholder="Select a note to start editing..." />
    );
  }

  return (
    <div className="editable">
      <div 
        ref={editorRef}
        role='inner-note'
        id="inner-note"
        className="w-full h-full"
      />
    </div>
  );
}

export default React.memo(NoteEditor);
