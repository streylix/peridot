import React, { useEffect, useRef } from 'react';
import { EditorState, Annotation } from '@codemirror/state';
import { EditorView, Decoration, ViewPlugin, WidgetType, keymap, placeholder } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { syntaxTree } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { apiService } from '../utils/ApiService';

const VOICE_NOTE_PREFIX = '::voice-note[';
const VOICE_NOTE_SUFFIX = ']';
const VOICE_RECORDING_PREFIX = '::voice-note-recording[';
const VOICE_RECORDING_SUFFIX = ']';
const activeRecorders = new Map();

const getVoiceNoteLineRanges = (doc) => {
  const ranges = [];
  for (let n = 1; n <= doc.lines; n += 1) {
    const line = doc.line(n);
    const trimmed = line.text.trim();
    if (!decodeVoiceNote(trimmed)) continue;
    const tokenStart = line.text.indexOf(trimmed);
    ranges.push({
      from: line.from + tokenStart,
      to: line.from + tokenStart + trimmed.length,
      lineFrom: line.from,
      lineTo: line.to,
      lineNumber: n,
    });
  }
  return ranges;
};

const rangesTouch = (from, to, range) => {
  if (from === to) return from === range.from || from === range.to;
  return from < range.to && to > range.from;
};

const changeTouchesVoiceNote = (from, to, range) => {
  if (from === to) return from >= range.lineFrom && from <= range.lineTo;
  return from <= range.lineTo && to >= range.lineFrom;
};

const getVoiceNoteRemovalRange = (doc, range) => {
  const from = range.lineNumber > 1 ? range.lineFrom - 1 : range.lineFrom;
  const to = range.lineNumber < doc.lines ? range.lineTo + 1 : range.lineTo;
  return { from, to };
};

const confirmVoiceNoteRemoval = () => (
  window.confirm('Remove this voice note?')
);

const replaceVoiceNotePayload = (view, from, to, voiceNote) => {
  const token = encodeVoiceNote(voiceNote);
  view.dispatch({
    changes: { from, to, insert: token },
    selection: { anchor: from + token.length },
    annotations: voiceNoteAtomicEdit.of(true),
  });
  view.focus();
};

const insertTabAtCaret = {
  key: 'Tab',
  run: (view) => {
    view.dispatch(view.state.replaceSelection('\t'));
    return true;
  },
};

const formatVoiceTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const encodeVoiceNote = (voiceNote) => (
  `${VOICE_NOTE_PREFIX}${encodeURIComponent(JSON.stringify(voiceNote))}${VOICE_NOTE_SUFFIX}`
);

const encodeRecordingVoiceNote = (id) => `${VOICE_RECORDING_PREFIX}${id}${VOICE_RECORDING_SUFFIX}`;

const decodeRecordingVoiceNote = (lineText) => {
  const trimmed = lineText.trim();
  if (!trimmed.startsWith(VOICE_RECORDING_PREFIX) || !trimmed.endsWith(VOICE_RECORDING_SUFFIX)) {
    return null;
  }
  return trimmed.slice(VOICE_RECORDING_PREFIX.length, -VOICE_RECORDING_SUFFIX.length);
};

const iconSvg = (name) => {
  const paths = {
    play: '<polygon points="6 3 20 12 6 21 6 3"></polygon>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"></rect><rect x="6" y="4" width="4" height="16" rx="1"></rect>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2"></rect>',
    x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    more: '<circle cx="5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle>',
    chevronDown: '<path d="m6 9 6 6 6-6"></path>',
    chevronUp: '<path d="m18 15-6-6-6 6"></path>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
    check: '<path d="M20 6 9 17l-5-5"></path>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
};

const decodeVoiceNote = (lineText) => {
  const trimmed = lineText.trim();
  if (!trimmed.startsWith(VOICE_NOTE_PREFIX) || !trimmed.endsWith(VOICE_NOTE_SUFFIX)) {
    return null;
  }
  try {
    const payload = trimmed.slice(VOICE_NOTE_PREFIX.length, -VOICE_NOTE_SUFFIX.length);
    const parsed = JSON.parse(decodeURIComponent(payload));
    if (!parsed?.dataUrl && !parsed?.audioId) return null;
    return {
      dataUrl: parsed.dataUrl || '',
      audioId: parsed.audioId || '',
      contentType: parsed.contentType || 'audio/webm',
      size: Number(parsed.size) || 0,
      duration: Number(parsed.duration) || 0,
      createdAt: parsed.createdAt || '',
      transcript: typeof parsed.transcript === 'string' ? parsed.transcript : '',
    };
  } catch {
    return null;
  }
};

const findRecordingRange = (view, id) => {
  const token = encodeRecordingVoiceNote(id);
  const doc = view.state.doc;
  for (let n = 1; n <= doc.lines; n += 1) {
    const line = doc.line(n);
    const start = line.text.indexOf(token);
    if (start !== -1) {
      return {
        from: line.from + start,
        to: line.from + start + token.length,
      };
    }
  }
  return null;
};

// Marks transactions we initiate to load a note's content so the update listener
// doesn't fire a save back to the server for the load itself.
const syncLoad = Annotation.define();
const voiceNoteAtomicEdit = Annotation.define();

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

class BulletWidget extends WidgetType {
  constructor(marker) {
    super();
    this.marker = marker;
  }
  eq(other) {
    return other.marker === this.marker;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-md-bullet';
    span.textContent = this.marker;
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

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
  destroy(dom) {
    const objectUrl = dom.querySelector('audio')?.dataset.objectUrl;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

class VoiceNoteWidget extends WidgetType {
  constructor(voiceNote, from, to) {
    super();
    this.voiceNote = voiceNote;
    this.from = from;
    this.to = to;
  }
  eq(other) {
    return (
      other.voiceNote.dataUrl === this.voiceNote.dataUrl &&
      other.voiceNote.audioId === this.voiceNote.audioId &&
      other.voiceNote.duration === this.voiceNote.duration &&
      other.voiceNote.transcript === this.voiceNote.transcript &&
      other.from === this.from &&
      other.to === this.to
    );
  }
  toDOM(view) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-voice-note';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-voice-note-play';
    button.innerHTML = iconSvg('play');
    button.setAttribute('aria-label', 'Play voice note');

    const menuWrap = document.createElement('span');
    menuWrap.className = 'cm-voice-note-menu-wrap';
    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'cm-voice-note-menu-button';
    menuButton.innerHTML = iconSvg('more');
    menuButton.setAttribute('aria-label', 'Voice note options');
    const menu = document.createElement('span');
    menu.className = 'cm-voice-note-menu';
    const transcribeButton = document.createElement('button');
    transcribeButton.type = 'button';
    transcribeButton.textContent = 'Transcribe';
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Remove';
    menu.append(transcribeButton, removeButton);
    menuWrap.append(menuButton, menu);

    const current = document.createElement('span');
    current.className = 'cm-voice-note-current';
    current.textContent = '0:00';

    const seek = document.createElement('button');
    seek.type = 'button';
    seek.className = 'cm-voice-note-seek';
    seek.setAttribute('aria-label', 'Voice note position');
    const progress = document.createElement('span');
    progress.className = 'cm-voice-note-progress';
    seek.appendChild(progress);

    const total = document.createElement('span');
    total.className = 'cm-voice-note-total';
    total.textContent = formatVoiceTime(this.voiceNote.duration);

    const hasTranscript = Boolean(this.voiceNote.transcript?.trim());
    const transcriptToggle = hasTranscript ? document.createElement('button') : null;
    const transcriptPanel = hasTranscript ? document.createElement('span') : null;
    const copyButton = hasTranscript ? document.createElement('button') : null;
    if (hasTranscript) {
      transcriptToggle.type = 'button';
      transcriptToggle.className = 'cm-voice-note-transcript-toggle';
      transcriptToggle.innerHTML = iconSvg('chevronDown');
      transcriptToggle.setAttribute('aria-label', 'Show transcript');

      transcriptPanel.className = 'cm-voice-note-transcript-panel';
      const transcriptText = document.createElement('span');
      transcriptText.className = 'cm-voice-note-transcript-text';
      transcriptText.textContent = this.voiceNote.transcript;
      copyButton.type = 'button';
      copyButton.className = 'cm-voice-note-copy';
      copyButton.innerHTML = iconSvg('copy');
      copyButton.setAttribute('aria-label', 'Copy transcript');
      transcriptPanel.append(transcriptText, copyButton);
    }

    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    if (this.voiceNote.dataUrl) {
      audio.src = this.voiceNote.dataUrl;
    } else if (this.voiceNote.audioId) {
      apiService.getVoiceNoteAudioObjectUrl(this.voiceNote.audioId)
        .then((url) => {
          audio.src = url;
          audio.dataset.objectUrl = url;
        })
        .catch((err) => {
          console.error('Failed to load voice note audio:', err);
        });
    }

    wrap.addEventListener('mousedown', (event) => event.stopPropagation());
    wrap.addEventListener('pointerdown', (event) => event.stopPropagation());
    wrap.addEventListener('click', (event) => event.stopPropagation());
    menuButton.addEventListener('click', () => {
      menuWrap.classList.toggle('is-open');
    });
    transcribeButton.addEventListener('click', async () => {
      menuWrap.classList.remove('is-open');
      menuButton.classList.add('is-loading');
      menuButton.innerHTML = '';
      transcribeButton.disabled = true;
      try {
        const transcript = await apiService.transcribeAudio({
          audioId: this.voiceNote.audioId,
          audioDataUrl: this.voiceNote.dataUrl,
        });
        replaceVoiceNotePayload(view, this.from, this.to, {
          ...this.voiceNote,
          transcript,
        });
      } catch (err) {
        console.error('Voice note transcription failed:', err);
        window.alert(err.message || 'Failed to transcribe voice note');
      } finally {
        menuButton.classList.remove('is-loading');
        menuButton.innerHTML = iconSvg('more');
        transcribeButton.disabled = false;
        transcribeButton.textContent = 'Transcribe';
      }
    });
    if (hasTranscript) {
      transcriptToggle.addEventListener('click', () => {
        const expanded = wrap.classList.toggle('is-transcript-open');
        transcriptToggle.innerHTML = iconSvg(expanded ? 'chevronUp' : 'chevronDown');
        transcriptToggle.setAttribute('aria-label', expanded ? 'Hide transcript' : 'Show transcript');
      });
      copyButton.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(this.voiceNote.transcript);
          copyButton.innerHTML = iconSvg('check');
          window.setTimeout(() => {
            copyButton.innerHTML = iconSvg('copy');
          }, 1400);
        } catch (err) {
          console.error('Failed to copy transcript:', err);
        }
      });
    }
    removeButton.addEventListener('click', () => {
      if (!confirmVoiceNoteRemoval()) return;
      const line = view.state.doc.lineAt(this.from);
      const range = getVoiceNoteRemovalRange(view.state.doc, {
        lineFrom: line.from,
        lineTo: line.to,
        lineNumber: line.number,
      });
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: '' },
        selection: { anchor: range.from },
        annotations: voiceNoteAtomicEdit.of(true),
      });
      view.focus();
    });

    button.addEventListener('click', () => {
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    });

    const seekToEvent = (event) => {
      const rect = seek.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const duration = Number.isFinite(audio.duration) ? audio.duration : this.voiceNote.duration;
      audio.currentTime = pct * Math.max(duration, 0);
      current.textContent = formatVoiceTime(audio.currentTime);
      progress.style.width = `${pct * 100}%`;
    };
    seek.addEventListener('pointerdown', seekToEvent);
    seek.addEventListener('click', seekToEvent);
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration)) {
        total.textContent = formatVoiceTime(audio.duration);
      }
    });
    audio.addEventListener('timeupdate', () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : this.voiceNote.duration;
      const pct = duration ? (audio.currentTime / duration) * 100 : 0;
      progress.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      current.textContent = formatVoiceTime(audio.currentTime);
    });
    audio.addEventListener('play', () => {
      button.innerHTML = iconSvg('pause');
      button.setAttribute('aria-label', 'Pause voice note');
      wrap.classList.add('is-playing');
    });
    audio.addEventListener('pause', () => {
      button.innerHTML = iconSvg('play');
      button.setAttribute('aria-label', 'Play voice note');
      wrap.classList.remove('is-playing');
    });
    audio.addEventListener('ended', () => {
      button.innerHTML = iconSvg('play');
      button.setAttribute('aria-label', 'Play voice note');
      wrap.classList.remove('is-playing');
    });

    wrap.append(button, menuWrap, current, seek, total);
    if (hasTranscript) wrap.append(transcriptToggle, transcriptPanel);
    wrap.append(audio);
    return wrap;
  }
  ignoreEvent() {
    return false;
  }
}

class VoiceRecordingWidget extends WidgetType {
  constructor(id) {
    super();
    this.id = id;
  }
  eq(other) {
    return other.id === this.id;
  }
  toDOM() {
    const recorder = activeRecorders.get(this.id);
    const wrap = document.createElement('span');
    wrap.className = 'cm-voice-note cm-voice-note-recording';

    const stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.className = 'cm-voice-note-play cm-voice-note-stop';
    stopButton.innerHTML = iconSvg('stop');
    stopButton.setAttribute('aria-label', 'Stop recording');

    const elapsed = document.createElement('span');
    elapsed.className = 'cm-voice-note-current';
    elapsed.textContent = '0:00';

    const waveform = document.createElement('span');
    waveform.className = 'cm-voice-waveform';
    const bars = Array.from({ length: 28 }, () => {
      const bar = document.createElement('span');
      waveform.appendChild(bar);
      return bar;
    });

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'cm-voice-note-cancel';
    cancelButton.innerHTML = iconSvg('x');
    cancelButton.setAttribute('aria-label', 'Cancel recording');

    wrap.addEventListener('mousedown', (event) => event.stopPropagation());
    wrap.addEventListener('pointerdown', (event) => event.stopPropagation());
    wrap.addEventListener('click', (event) => event.stopPropagation());

    let frame = 0;
    let raf = 0;
    const animate = () => {
      if (!document.body.contains(wrap)) return;
      const seconds = recorder ? (Date.now() - recorder.startedAt) / 1000 : 0;
      elapsed.textContent = formatVoiceTime(seconds);

      let level = 0.08;
      if (recorder?.analyser && recorder?.dataArray) {
        recorder.analyser.getByteTimeDomainData(recorder.dataArray);
        let sum = 0;
        recorder.dataArray.forEach((value) => {
          const normalized = (value - 128) / 128;
          sum += normalized * normalized;
        });
        level = Math.min(1, Math.sqrt(sum / recorder.dataArray.length) * 4);
      }

      bars.forEach((bar, index) => {
        const wave = Math.sin(frame / 5 + index * 0.75) * 0.5 + 0.5;
        const height = 18 + (level * 54 * wave);
        bar.style.height = `${height}%`;
      });
      frame += 1;
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    const cleanup = () => cancelAnimationFrame(raf);
    stopButton.addEventListener('click', () => {
      cleanup();
      recorder?.stop();
    });
    cancelButton.addEventListener('click', () => {
      cleanup();
      recorder?.cancel();
    });

    wrap.append(stopButton, waveform, elapsed, cancelButton);
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
      const voiceNoteLines = new Set();

      // Title line: always decorate line 1 as the note title (Obsidian-style inline title).
      if (view.state.doc.lines >= 1) {
        const line1 = view.state.doc.line(1);
        items.push(Decoration.line({ class: 'cm-md-title' }).range(line1.from));
      }

      for (let pos = vFrom; pos <= vTo;) {
        const line = view.state.doc.lineAt(pos);
        const voiceNote = decodeVoiceNote(line.text);
        if (voiceNote) {
          voiceNoteLines.add(line.number);
          items.push(
            Decoration.replace({
              widget: new VoiceNoteWidget(voiceNote, line.from, line.to),
            }).range(line.from, line.to)
          );
        }
        const recordingId = decodeRecordingVoiceNote(line.text);
        if (recordingId) {
          voiceNoteLines.add(line.number);
          items.push(
            Decoration.replace({
              widget: new VoiceRecordingWidget(recordingId),
            }).range(line.from, line.to)
          );
        }
        if (line.to >= vTo || line.number === view.state.doc.lines) break;
        pos = line.to + 1;
      }

      syntaxTree(view.state).iterate({
        from: vFrom,
        to: vTo,
        enter: (node) => {
          if (voiceNoteLines.has(view.state.doc.lineAt(node.from).number)) return false;
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
              // Swallow whitespace that immediately follows the marker so the
              // gap left by `# ` / `- ` / `> ` disappears with the marker.
              let to = node.to;
              const docText = view.state.doc.sliceString(to, to + 4);
              const ws = docText.match(/^[ \t]+/);
              if (ws) to += ws[0].length;
              if (name === 'ListMark') {
                // Replace `- ` / `* ` / `+ ` with a bullet so unordered lists
                // still render a visible marker when the cursor is elsewhere.
                items.push(
                  Decoration.replace({ widget: new BulletWidget('• ') }).range(node.from, to)
                );
              } else {
                items.push(Decoration.replace({}).range(node.from, to));
              }
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

const deleteVoiceNoteRanges = (view, ranges) => {
  if (!ranges.length) return false;
  if (!confirmVoiceNoteRemoval()) return true;

  const removals = ranges
    .map(range => getVoiceNoteRemovalRange(view.state.doc, range))
    .sort((a, b) => a.from - b.from)
    .reduce((merged, range) => {
      const last = merged[merged.length - 1];
      if (last && range.from <= last.to) {
        last.to = Math.max(last.to, range.to);
      } else {
        merged.push({ ...range });
      }
      return merged;
    }, []);

  view.dispatch({
    changes: removals.map(range => ({ from: range.from, to: range.to, insert: '' })),
    selection: { anchor: removals[0].from },
    annotations: voiceNoteAtomicEdit.of(true),
  });
  return true;
};

const deleteAdjacentVoiceNote = (direction) => (view) => {
  const selection = view.state.selection.main;
  const ranges = getVoiceNoteLineRanges(view.state.doc);
  if (!selection.empty) {
    const touched = ranges.filter(range => rangesTouch(selection.from, selection.to, range));
    return deleteVoiceNoteRanges(view, touched);
  }

  const cursor = selection.head;
  const target = ranges.find(range => (
    direction === 'backward'
      ? cursor === range.to || cursor === range.lineTo || cursor === range.lineTo + 1
      : cursor === range.from || cursor === range.lineFrom || cursor === range.lineFrom - 1
  ));
  return deleteVoiceNoteRanges(view, target ? [target] : []);
};

const cutVoiceNoteSelection = (view) => {
  const selection = view.state.selection.main;
  if (selection.empty) return false;
  const ranges = getVoiceNoteLineRanges(view.state.doc)
    .filter(range => rangesTouch(selection.from, selection.to, range));
  return deleteVoiceNoteRanges(view, ranges);
};

const editorKeys = keymap.of([
  { key: 'Mod-b', run: wrapSelection('**', '**', 'bold text') },
  { key: 'Mod-i', run: wrapSelection('*', '*', 'italic text') },
  { key: 'Mod-k', run: insertLink },
  { key: 'Enter', run: continueList },
  { key: 'Backspace', run: deleteAdjacentVoiceNote('backward') },
  { key: 'Delete', run: deleteAdjacentVoiceNote('forward') },
  { key: 'Mod-x', run: cutVoiceNoteSelection },
]);

function MarkdownEditor({ note, onUpdateNote, voiceNoteRequest, onVoiceNoteRequestHandled }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const noteIdRef = useRef(null);
  const handledVoiceRequestRef = useRef(null);
  const noteRef = useRef(note);
  noteRef.current = note;
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
      cut(event) {
        const selection = view.state.selection.main;
        if (selection.empty) return false;
        const ranges = getVoiceNoteLineRanges(view.state.doc)
          .filter(range => rangesTouch(selection.from, selection.to, range));
        if (!ranges.length) return false;
        event.preventDefault();
        deleteVoiceNoteRanges(view, ranges);
        return true;
      },
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
          history(),
          editorKeys,
          keymap.of([insertTabAtCaret, ...defaultKeymap, ...historyKeymap]),
          EditorView.contentAttributes.of({ spellcheck: 'true' }),
          markdown({ extensions: [GFM] }),
          placeholder('Start writing...'),
          EditorView.lineWrapping,
          editorTheme,
          darkOverrides,
          livePreview,
          EditorView.atomicRanges.of((view) => view.plugin(livePreview)?.decorations || Decoration.none),
          EditorState.transactionFilter.of((tr) => {
            if (!tr.docChanged || tr.annotation(syncLoad) || tr.annotation(voiceNoteAtomicEdit)) {
              return tr;
            }
            const ranges = getVoiceNoteLineRanges(tr.startState.doc);
            if (!ranges.length) return tr;

            let touchesVoiceNote = false;
            tr.changes.iterChanges((fromA, toA) => {
              if (ranges.some(range => changeTouchesVoiceNote(fromA, toA, range))) {
                touchesVoiceNote = true;
              }
            });
            return touchesVoiceNote ? [] : tr;
          }),
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
    // Load current note content into the freshly-created view. Doing this here
    // (instead of relying solely on the sync effect) handles React StrictMode's
    // setup/cleanup/setup cycle, where the sync effect would otherwise have
    // already marked noteIdRef and skip-loaded the second view.
    const current = noteRef.current;
    if (current) {
      const incoming = current.content || '';
      const caretPosition = Math.min(current.caretPosition ?? incoming.length, incoming.length);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: incoming },
        selection: { anchor: caretPosition },
        annotations: syncLoad.of(true),
      });
      noteIdRef.current = current.id;
      view.focus();
    }
    return () => {
      activeRecorders.forEach((recorder) => {
        if (recorder.view === view) recorder.cancel({ removeToken: false });
      });
      hostRef.current?.removeEventListener('mousedown', focusHandler);
      view.destroy();
      viewRef.current = null;
      noteIdRef.current = null;
      if (typeof window !== 'undefined' && window.__peridotCMView === view) {
        delete window.__peridotCMView;
      }
    };
  }, []);

  // Sync content when the selected note changes after the editor is already mounted.
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

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !voiceNoteRequest || handledVoiceRequestRef.current === voiceNoteRequest.id) return;
    handledVoiceRequestRef.current = voiceNoteRequest.id;
    onVoiceNoteRequestHandled?.(null);

    const startInlineRecording = async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        console.error('Voice recording is not available in this browser.');
        return;
      }

      const selection = view.state.selection.main;
      const line = view.state.doc.lineAt(selection.head);
      const lineHasContent = line.text.trim().length > 0;
      const recordingId = String(voiceNoteRequest.id);
      const recordingToken = encodeRecordingVoiceNote(recordingId);
      let stream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.error('Voice note recording failed:', err);
        return;
      }

      const chunks = [];
      const recorder = new MediaRecorder(stream);
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = AudioContextClass ? new AudioContextClass() : null;
      const source = audioContext?.createMediaStreamSource(stream);
      const analyser = audioContext?.createAnalyser();
      if (analyser) {
        analyser.fftSize = 128;
        source.connect(analyser);
      }
      const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
      let tracksStopped = false;

      const stopTracks = () => {
        if (tracksStopped) return;
        tracksStopped = true;
        stream.getTracks().forEach(track => track.stop());
        audioContext?.close();
      };
      const removeRecordingToken = () => {
        const range = findRecordingRange(view, recordingId);
        if (range) {
          const tokenLine = view.state.doc.lineAt(range.from);
          const removeWholeLine = tokenLine.text.trim() === recordingToken && tokenLine.number > 1;
          view.dispatch({
            changes: {
              from: removeWholeLine ? tokenLine.from - 1 : range.from,
              to: removeWholeLine ? tokenLine.to : range.to,
              insert: '',
            },
            annotations: syncLoad.of(true),
          });
        }
      };

      activeRecorders.set(recordingId, {
        view,
        startedAt: Date.now(),
        analyser,
        dataArray,
        stop: () => {
          if (recorder.state !== 'inactive') recorder.stop();
        },
        cancel: ({ removeToken = true } = {}) => {
          if (recorder.state !== 'inactive') {
            recorder.onstop = null;
            recorder.stop();
          }
          stopTracks();
          activeRecorders.delete(recordingId);
          if (removeToken) removeRecordingToken();
        },
      });

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        const range = findRecordingRange(view, recordingId);
        const startedAt = activeRecorders.get(recordingId)?.startedAt || Date.now();
        stopTracks();
        activeRecorders.delete(recordingId);
        if (!range) return;
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          const duration = Math.max(0, (Date.now() - startedAt) / 1000);
          const audioRecord = await apiService.uploadVoiceNoteAudio(blob, duration);
          const token = encodeVoiceNote({
            audioId: audioRecord.id,
            contentType: audioRecord.contentType,
            size: audioRecord.size,
            duration,
            createdAt: new Date().toISOString(),
          });
          view.dispatch({
            changes: { from: range.from, to: range.to, insert: token },
            selection: { anchor: range.from + token.length },
          });
          view.focus();
        } catch (err) {
          console.error('Failed to save voice note audio:', err);
          view.dispatch({
            changes: { from: range.from, to: range.to, insert: '' },
            annotations: syncLoad.of(true),
          });
          window.alert(err.message || 'Failed to save voice note audio');
        }
      };

      const insert = lineHasContent ? `\n${recordingToken}` : recordingToken;
      const from = lineHasContent ? line.to : line.from;
      view.dispatch({
        changes: { from, to: line.to, insert },
        selection: { anchor: from + insert.length },
        annotations: syncLoad.of(true),
      });
      recorder.start(1000);
      view.focus();
    };

    startInlineRecording();
  }, [voiceNoteRequest, onVoiceNoteRequestHandled]);

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
