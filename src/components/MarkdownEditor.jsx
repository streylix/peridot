import React, { useEffect, useRef } from 'react';
import { EditorState, Annotation } from '@codemirror/state';
import { EditorView, Decoration, ViewPlugin, WidgetType, keymap, placeholder } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { syntaxTree } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

// Marks transactions we initiate to load a note's content so the update listener
// doesn't fire a save back to the server for the load itself.
const syncLoad = Annotation.define();

// Block-level markers — visibility tied to whether the cursor is on the same line.
const BLOCK_MARK_NAMES = new Set(['HeaderMark', 'QuoteMark', 'ListMark']);
// Inline markers — visibility tied to whether the cursor is inside the styled span itself.
const INLINE_MARK_NAMES = new Set([
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'LinkMark',
]);

const STYLE_NODE_NAMES = {
  StrongEmphasis: 'cm-md-bold',
  Emphasis: 'cm-md-italic',
  InlineCode: 'cm-md-code',
  Strikethrough: 'cm-md-strike',
  Link: 'cm-md-link',
  ATXHeading1: 'cm-md-h1',
  ATXHeading2: 'cm-md-h2',
  ATXHeading3: 'cm-md-h3',
  ATXHeading4: 'cm-md-h4',
  ATXHeading5: 'cm-md-h5',
  ATXHeading6: 'cm-md-h6',
  Blockquote: 'cm-md-quote',
  FencedCode: 'cm-md-fenced',
};

class CheckboxWidget extends WidgetType {
  constructor(checked, from, to) {
    super();
    this.checked = checked;
    this.from = from;
    this.to = to;
  }
  eq(other) {
    return other.checked === this.checked && other.from === this.from && other.to === this.to;
  }
  toDOM(view) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-md-task';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.checked;
    box.className = 'cm-md-task-box';
    box.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const replacement = this.checked ? '[ ]' : '[x]';
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: replacement },
      });
    });
    wrap.appendChild(box);
    return wrap;
  }
  ignoreEvent() {
    return false;
  }
}

const livePreview = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.build(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.build(update.view);
      }
    }
    build(view) {
      const { from: vFrom, to: vTo } = view.viewport;
      const sel = view.state.selection.main;
      const cursorIn = (from, to) => sel.from <= to && sel.to >= from;
      const activeLines = new Set();
      const startLine = view.state.doc.lineAt(sel.from).number;
      const endLine = view.state.doc.lineAt(sel.to).number;
      for (let n = startLine; n <= endLine; n++) activeLines.add(n);

      const items = [];

      // Title line: always decorate line 1 as the note title (Obsidian-style inline title).
      if (view.state.doc.lines >= 1) {
        const line1 = view.state.doc.line(1);
        items.push(Decoration.line({ class: 'cm-md-title' }).range(line1.from));
      }

      syntaxTree(view.state).iterate({
        from: vFrom,
        to: vTo,
        enter: (node) => {
          const name = node.name;

          // Inline styles (mark decoration)
          if (STYLE_NODE_NAMES[name]) {
            const klass = STYLE_NODE_NAMES[name];
            if (
              name.startsWith('ATXHeading') ||
              name === 'Blockquote' ||
              name === 'FencedCode'
            ) {
              const lineFrom = view.state.doc.lineAt(node.from).number;
              const lineTo = view.state.doc.lineAt(node.to).number;
              for (let n = lineFrom; n <= lineTo; n++) {
                const line = view.state.doc.line(n);
                items.push(Decoration.line({ class: klass }).range(line.from));
              }
            } else if (node.from < node.to) {
              items.push(Decoration.mark({ class: klass }).range(node.from, node.to));
            }
          }

          // Inline markers — hide unless cursor is anywhere within the parent styled span.
          // Skip LinkMark here; Link nodes are handled below as a whole so the URL part
          // (which has no dedicated node name) is also hidden.
          if (INLINE_MARK_NAMES.has(name) && name !== 'LinkMark' && node.from < node.to) {
            const parent = node.node.parent;
            const span = parent ? { from: parent.from, to: parent.to } : { from: node.from, to: node.to };
            if (!cursorIn(span.from, span.to)) {
              items.push(Decoration.replace({}).range(node.from, node.to));
            }
          }

          // Link: keep only the bracketed text visible when the cursor isn't inside,
          // and tag that text with a data-href attribute so we can open it on Cmd/Ctrl+click.
          if (name === 'Link') {
            const linkNode = node.node;
            const firstMark = linkNode.firstChild; // `[`
            let secondMark = firstMark?.nextSibling || null;
            while (secondMark && secondMark.name !== 'LinkMark') secondMark = secondMark.nextSibling;
            const inSpan = cursorIn(node.from, node.to);
            // Extract URL from between `(` and `)` so we can attach it to the link text.
            const docText = view.state.doc.sliceString(node.from, node.to);
            const m = docText.match(/\]\(([^)]+)\)/);
            const url = m ? m[1] : '';
            if (firstMark && secondMark) {
              const textFrom = firstMark.to;
              const textTo = secondMark.from;
              if (textFrom < textTo && url) {
                items.push(
                  Decoration.mark({
                    class: 'cm-md-linktext',
                    attributes: { 'data-href': url },
                  }).range(textFrom, textTo)
                );
              }
              if (!inSpan) {
                if (firstMark.from < firstMark.to) {
                  items.push(Decoration.replace({}).range(firstMark.from, firstMark.to));
                }
                if (secondMark.from < node.to) {
                  items.push(Decoration.replace({}).range(secondMark.from, node.to));
                }
              }
            }
          }

          // Block markers — hide unless cursor is on the same line. Skip ListMark
          // when the item is a task; the TaskMarker handler below replaces the
          // whole `- [ ]` prefix and the two ranges would overlap.
          if (BLOCK_MARK_NAMES.has(name) && node.from < node.to) {
            if (name === 'ListMark') {
              const line = view.state.doc.lineAt(node.from);
              const lineText = view.state.doc.sliceString(line.from, line.to);
              if (/^\s*(?:[-*+]|\d+[.)])\s+\[(?: |x|X)\]/.test(lineText)) {
                return;
              }
            }
            const markerLine = view.state.doc.lineAt(node.from).number;
            if (!activeLines.has(markerLine)) {
              items.push(Decoration.replace({}).range(node.from, node.to));
            }
          }

          // Task checkboxes stay as widgets even on the active line. Replace the
          // whole `- [ ]` (or `* [x]`, `1. [ ]` …) prefix with the checkbox so the
          // list marker never bleeds through when the cursor is on the line.
          if (name === 'TaskMarker') {
            const line = view.state.doc.lineAt(node.from);
            const beforeMarker = view.state.doc.sliceString(line.from, node.from);
            const listPrefix = beforeMarker.match(/^(\s*)(?:[-*+]|\d+[.)])\s+$/);
            const replaceFrom = listPrefix ? line.from + listPrefix[1].length : node.from;
            const text = view.state.doc.sliceString(node.from, node.to);
            const checked = /x/i.test(text);
            items.push(
              Decoration.replace({
                widget: new CheckboxWidget(checked, node.from, node.to),
              }).range(replaceFrom, node.to)
            );
          }
        },
      });
      return Decoration.set(items, true);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

const editorTheme = EditorView.theme(
  {
    '&': { fontSize: 'var(--md-editor-font-size, 15px)' },
    '.cm-scroller': {
      fontFamily:
        'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      lineHeight: '1.6',
      padding: '24px 32px',
    },
    '.cm-content': { caretColor: 'currentColor' },
    '.cm-line': { padding: '0' },
    '.cm-md-h1': {
      fontSize: '1.8em',
      fontWeight: '700',
      lineHeight: '1.25',
    },
    '.cm-md-h2': {
      fontSize: '1.5em',
      fontWeight: '700',
      lineHeight: '1.3',
    },
    '.cm-md-h3': {
      fontSize: '1.25em',
      fontWeight: '600',
    },
    '.cm-md-h4': { fontSize: '1.1em', fontWeight: '600' },
    '.cm-md-h5': { fontSize: '1em', fontWeight: '600' },
    '.cm-md-h6': { fontSize: '0.95em', fontWeight: '600', opacity: '0.8' },
    '.cm-md-bold': { fontWeight: '700' },
    '.cm-md-italic': { fontStyle: 'italic' },
    '.cm-md-strike': { textDecoration: 'line-through' },
    '.cm-md-code': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      backgroundColor: 'rgba(127,127,127,0.15)',
      padding: '0.1em 0.35em',
      borderRadius: '3px',
      fontSize: '0.92em',
    },
    '.cm-md-link': { color: '#3b82f6', textDecoration: 'underline' },
    '.cm-md-linktext': {
      color: '#3b82f6',
      textDecoration: 'underline',
      cursor: 'pointer',
    },
    '.cm-md-title': {
      fontSize: '2.2em',
      fontWeight: '700',
      lineHeight: '1.2',
      /* Outset the visual underline so it doesn't change the line's box. */
      boxShadow: 'inset 0 -1px 0 rgba(127,127,127,0.25)',
    },
    '.cm-md-quote': {
      borderLeft: '3px solid rgba(127,127,127,0.45)',
      paddingLeft: '1em',
      color: 'rgba(0,0,0,0.7)',
    },
    '.cm-md-fenced': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      backgroundColor: 'rgba(127,127,127,0.10)',
    },
  },
  { dark: false }
);

const darkOverrides = EditorView.theme(
  {
    '.cm-md-quote': { color: 'rgba(255,255,255,0.7)' },
    '.cm-md-link': { color: '#60a5fa' },
  },
  { dark: true }
);

const isUrl = (text) => /^https?:\/\/\S+$/i.test(text.trim());

const wrapSelection = (before, after = before, fallback = 'text') => (view) => {
  const selection = view.state.selection.main;
  const selected = view.state.doc.sliceString(selection.from, selection.to);
  const body = selected || fallback;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: `${before}${body}${after}` },
    selection: {
      anchor: selection.from + before.length,
      head: selection.from + before.length + body.length,
    },
  });
  return true;
};

const insertLink = (view) => {
  const selection = view.state.selection.main;
  const selected = view.state.doc.sliceString(selection.from, selection.to) || 'link text';
  const url = window.prompt('Link URL');
  if (!url) return true;
  const link = `[${selected}](${url})`;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: link },
    selection: {
      anchor: selection.from + 1,
      head: selection.from + 1 + selected.length,
    },
  });
  return true;
};

const continueList = (view) => {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const line = view.state.doc.lineAt(selection.head);
  const beforeCursor = line.text.slice(0, selection.head - line.from);
  const match = beforeCursor.match(/^(\s*)([-*+]|\d+[.)])\s+(\[(?: |x|X)\]\s+)?(.*)$/);
  if (!match) return false;

  const [, indent, marker, taskMarker = '', textAfterMarker] = match;
  if (!textAfterMarker.trim()) {
    view.dispatch({
      changes: { from: line.from, to: selection.head, insert: indent },
    });
    return true;
  }

  const nextMarker = /^\d/.test(marker)
    ? marker.replace(/\d+/, n => String(Number(n) + 1))
    : marker;
  view.dispatch({
    changes: {
      from: selection.head,
      insert: `\n${indent}${nextMarker} ${taskMarker}`,
    },
  });
  return true;
};

const editorKeys = keymap.of([
  { key: 'Mod-b', run: wrapSelection('**', '**', 'bold text') },
  { key: 'Mod-i', run: wrapSelection('*', '*', 'italic text') },
  { key: 'Mod-k', run: insertLink },
  { key: 'Enter', run: continueList },
]);

function MarkdownEditor({ note, onUpdateNote }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const noteIdRef = useRef(null);
  const onUpdateRef = useRef(onUpdateNote);
  onUpdateRef.current = onUpdateNote;

  // Mount once.
  useEffect(() => {
    if (!hostRef.current) return;
    const debounce = (fn, ms) => {
      let t;
      return (...a) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
      };
    };
    const debouncedSave = debounce((content) => {
      onUpdateRef.current?.({ content }, true);
    }, 200);
    const debouncedSaveCaret = debounce((caretPosition) => {
      onUpdateRef.current?.({ caretPosition }, false);
    }, 250);

    const linkClickHandler = EditorView.domEventHandlers({
      mousedown(event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return false;
        const linkEl = target.closest('[data-href]');
        if (!linkEl) return false;
        const href = linkEl.getAttribute('data-href');
        if (!href) return false;
        // Cmd/Ctrl+click opens the link; plain click positions the cursor as normal.
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          window.open(href, '_blank', 'noopener,noreferrer');
          return true;
        }
        return false;
      },
      paste(event) {
        const text = event.clipboardData?.getData('text/plain');
        const selection = view.state.selection.main;
        if (!text || selection.empty || !isUrl(text)) return false;
        const selected = view.state.doc.sliceString(selection.from, selection.to);
        event.preventDefault();
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: `[${selected}](${text.trim()})` },
        });
        return true;
      },
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
          history(),
          editorKeys,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ extensions: [GFM] }),
          placeholder('Start writing...'),
          EditorView.lineWrapping,
          editorTheme,
          darkOverrides,
          livePreview,
          linkClickHandler,
          EditorView.updateListener.of((update) => {
            const isSyncLoad = update.transactions.some(tr => tr.annotation(syncLoad));
            if (isSyncLoad) return;
            if (update.docChanged) {
              debouncedSave(update.state.doc.toString());
            }
            if (update.selectionSet) {
              debouncedSaveCaret(update.state.selection.main.head);
            }
          }),
        ],
      }),
      parent: hostRef.current,
    });

    // Clicking anywhere in the host (including padding/empty area below content) focuses
    // the editor and places the cursor at the end of the document.
    const focusHandler = (e) => {
      if (!hostRef.current) return;
      // If the click landed on the editor itself, let CM6 handle it.
      if (e.target.closest('.cm-content')) return;
      // Prevent the default focus-shifting behavior so view.focus() sticks.
      e.preventDefault();
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      view.focus();
    };
    hostRef.current.addEventListener('mousedown', focusHandler);
    viewRef.current = view;
    if (typeof window !== 'undefined') window.__peridotCMView = view;
    return () => {
      hostRef.current?.removeEventListener('mousedown', focusHandler);
      view.destroy();
      viewRef.current = null;
      if (typeof window !== 'undefined' && window.__peridotCMView === view) {
        delete window.__peridotCMView;
      }
    };
  }, []);

  // Sync content when the selected note changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !note) return;
    if (noteIdRef.current === note.id) return;
    noteIdRef.current = note.id;
    const incoming = note.content || '';
    const caretPosition = Math.min(note.caretPosition ?? incoming.length, incoming.length);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: incoming },
      selection: { anchor: caretPosition },
      annotations: syncLoad.of(true),
    });
    view.focus();
  }, [note?.id, note?.content]);

  if (!note) {
    return <div className="md-editor-wrapper" data-empty="true" />;
  }

  return (
    <div className="md-editor-wrapper">
      <div ref={hostRef} className="md-editor-host" data-testid="markdown-editor" />
    </div>
  );
}

export default React.memo(MarkdownEditor);
