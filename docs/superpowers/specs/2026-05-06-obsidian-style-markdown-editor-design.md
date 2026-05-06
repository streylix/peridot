# Peridot — Obsidian-Style Markdown Editor (v1) Design

Date: 2026-05-06
Status: Approved (brainstorming → writing-plans)

## 1. Goals and non-goals

**Goals.** Replace the contentEditable/HTML `NoteEditor` with a CodeMirror 6 editor that does Live Preview by default with a Source mode toggle. Move canonical storage to GitHub-flavored markdown. Migrate existing HTML notes once with a recoverable backup column. Promote embedded images to first-class attachments served from the backend.

**Non-goals (v1).** Wikilinks, embeds (`![[note]]`), callouts, math, Mermaid, backlinks panel, graph view, command palette. These are explicit v2 candidates.

## 2. Architecture overview

Three independent layers, each with one responsibility.

- **Editor layer (frontend).** A CodeMirror 6 instance wrapped in a `MarkdownEditor` React component. Owns text buffer, Live Preview decoration, source toggle, markdown shortcuts, and attachment upload on paste/drop. Replaces `src/components/NoteEditor.jsx`.
- **Markdown services (frontend).** Pure utilities. `markdownPreview` (first-line title + preview lines, replacing `NoteContentService.getFirstLine` / `getPreviewContent`). `htmlToMarkdown` (one-shot conversion using `turndown` plus GFM and image-extraction plugins).
- **Attachments service (backend).** New `Attachment` Django model and REST endpoints for upload/fetch, scoped per user.

The note model's shape does not change. `content` remains a string; after migration, it holds markdown instead of HTML. No `format` discriminator field is added — every note is markdown post-migration.

## 3. Data model changes

### 3.1 Notes table

Add a single nullable column:

```
legacy_html_content TEXT NULL
```

Populated by the migration with the pre-conversion HTML for every note that gets converted. No production code reads this column. It is purely a recovery path. It is dropped in a follow-up release once conversions are confirmed clean.

### 3.2 New `Attachment` model

```python
class Attachment(models.Model):
    id = UUIDField(primary_key=True, default=uuid4)
    user = ForeignKey(AppUser, on_delete=CASCADE)
    note = ForeignKey(Note, on_delete=CASCADE, null=True)
    mime = CharField(max_length=100)
    data = BinaryField()
    created_at = DateTimeField(auto_now_add=True)
```

`note` is nullable so a freshly-uploaded attachment can exist briefly before the editor saves the markdown that references it. A periodic cleanup of orphaned attachments can be added later but is not required for v1.

DB-stored bytes (not S3 or disk) is the right choice for v1: deployment stays trivial, attachments inherit the same backup story as the rest of the database, and a future "encrypt attachments" feature stays inside the DB. Migration to object storage later is straightforward.

### 3.3 New endpoints

- `POST /api/attachments/` — multipart upload. Returns `{id, url}`.
- `GET /api/attachments/<uuid>/` — streams bytes with the correct `Content-Type`. Authenticated. Returns 404 (not 403) if the attachment is not owned by the requesting user, to avoid leaking existence.
- `DELETE /api/attachments/<uuid>/` — for cleanup; not required to be wired into the UI in v1.

## 4. Live Preview behavior

The editor renders markdown as styled rich text by default. When the cursor is on a line, that line's syntax markers (`#`, `**`, `[ ](url)`, etc.) are visible. When the cursor leaves, they collapse back into rendered form. Headings size up. Bold/italic/strike apply real styles. Lists indent and bullet/number. Checkboxes are clickable. Code blocks get a monospaced background. Tables render aligned. Links are clickable (Ctrl/Cmd+click opens in a new tab) and show their URL only when the cursor is inside them.

Implementation: a CodeMirror state field walks the parsed Lezer markdown tree on every transaction and produces decorations.

- `Decoration.replace` for syntax markers (zero-width replacements unless cursor overlaps).
- `Decoration.mark` for inline styles (bold, italic, strike, code).
- `Decoration.line` for headings and blockquotes.
- `Decoration.widget` for the rendered `<img>` tag of an attachment URL.

Source mode is the same editor with this state field disabled. The underlying buffer is identical, so toggling is instant and cursor position is preserved.

## 5. Markdown editor component

`src/components/MarkdownEditor.jsx` replaces `src/components/NoteEditor.jsx`.

Props:

```
{ note, onUpdateNote, encryptionContext, sourceMode, onSourceModeChange }
```

Behavior:

- Mounts a CM6 `EditorView` in an effect; tears it down on unmount.
- Listens for buffer changes, debounces 200ms (matching the existing `NoteUpdateService` timing), calls `onUpdateNote({ content })`.
- Saves and restores cursor position on note switch by serializing `state.selection.main` to a number, replacing the existing `caretPosition` flow.
- Paste/drop handler: if the payload is an image, POSTs to `/api/attachments/`, then inserts `![](\/api/attachments/<id>)` at the cursor.

## 6. Source mode toggle UX

A button in `Header.jsx` next to the existing info/stats buttons, using a "code" glyph. Toggles a `sourceMode` boolean owned by `MainContent`. Keyboard shortcut `Ctrl+E` / `Cmd+E` (Obsidian's binding). State is per-note-session and is not persisted — switching notes resets to Live Preview. This keeps v1 free of a settings rabbit hole.

## 7. Migration

The migration runs in two parts:

### 7.1 Backend (one-shot, synchronous)

A Django data migration adds `legacy_html_content` and copies `content` into it for every existing note. It does not attempt HTML→markdown conversion. It is idempotent: re-runs skip rows where `legacy_html_content IS NOT NULL`.

### 7.2 Frontend (lazy, on first read)

When the editor loads a note whose content is HTML-shaped (heuristic: starts with `<div>`, or contains `<img`, `<br`, or a tag-pair structure), it runs the conversion in-memory:

1. Walk the HTML, extract every `<img src="data:...">` into an `Attachment` upload, and replace the `<img>` with one pointing at the new attachment URL.
2. Run `turndown` + `turndown-plugin-gfm` on the modified HTML.
3. Open the resulting markdown in the editor.
4. On the next debounced save (or immediately if the user makes no edits in N seconds), persist the converted markdown via the normal note PUT.

Locked encrypted notes are skipped by the backend migration for `legacy_html_content` purposes — their stored content is ciphertext and was never HTML. When such a note is permanently unlocked (`note_unlock_permanent`), the same lazy conversion runs on the decrypted plaintext before the plaintext is saved back. This requires a small branch in the unlock-permanent path that runs the JS conversion via the editor (the unlock flow already returns to the frontend before saving plaintext).

A backfill script can later convert any unopened notes after a release cycle.

The HTML→markdown conversion lives in JS (not Python) for three reasons: `turndown` is the most battle-tested tool for browser-produced HTML, the existing edge cases (data URLs, nested divs from contentEditable) have known JS workarounds, and the same code is reused at runtime by the lazy path.

## 8. Sidebar / preview / search

`NoteContentService.getFirstLine` and `getPreviewContent` are replaced with a `markdownPreview` utility:

- For the title: take the first non-empty line, strip one leading run of `#`s, return the text.
- For the preview: strip markdown syntax from the next several lines (headings, emphasis markers, links → link text, images → `[image]`).

`searchService` already searches title + preview, so it inherits this transparently.

## 9. Export / import

- **Export to `.md`** — already markdown; trivial.
- **Export to `.txt`** — strip markdown syntax using the same preview utility.
- **Export to `.json`** — `content` is markdown string in the dump.
- **Export to PDF** — render markdown to HTML on the fly using `marked`, then feed the existing PDF pipeline (`PDFExportModal` currently consumes HTML, so this is a small adapter).
- **Import `.md`** — content imports directly.
- **Import `.txt`** — imports as-is.
- **Import `.json`** — content runs through the same HTML-shape heuristic; HTML-looking imports go through lazy conversion.

## 10. Locked / encrypted notes

No model changes. The encryption layer treats `content` as an opaque string regardless of format. When a locked note is unlocked for editing, the editor opens in Live Preview. When re-locked, the markdown is encrypted as before. If a legacy locked note's plaintext is HTML-shaped, the lazy conversion runs after decrypt and the converted markdown is re-encrypted on save.

## 11. Testing

- **Unit (Vitest).** `markdownPreview` (titles, previews, edge cases: empty, whitespace-only, image-only). `htmlToMarkdown` migration helper with golden fixtures covering data-URL images, nested divs, `<br>` runs, mixed inline tags, GIFs from Giphy, and decrypted-then-converted HTML.
- **Editor integration.** Mount `MarkdownEditor` in jsdom; type into it; assert serialized markdown matches expected; toggle source mode and assert buffer is identical; paste an image blob and assert attachment POST is called and the inserted text matches `![](\/api/attachments/<uuid>)`.
- **Backend (Django TestCase).** Attachment upload (auth, ownership, size limit, mime sniffing). Attachment fetch (404 for other users' attachments). One-time migration adding `legacy_html_content` is idempotent and copies content correctly.

## 12. Build sequence (sketch)

A full step-by-step plan comes from the writing-plans skill next. High level:

1. Backend: `Attachment` model + endpoints + tests; data migration adding `legacy_html_content`.
2. Frontend utilities: `markdownPreview`, `htmlToMarkdown` (turndown wrapper) with full unit tests.
3. Frontend: `MarkdownEditor` component, built up in stages (read-only → editable → Live Preview decorations → source toggle → attachment paste/drop).
4. Wire `MarkdownEditor` into `MainContent`, retire `NoteEditor.jsx`, switch sidebar/preview/search to `markdownPreview`.
5. Update import/export and PDF rendering for markdown.
6. Lazy on-read HTML→markdown conversion for legacy notes.
7. Locked-note conversion on unlock-permanent.

## 13. Risks

- **CM6 bundle size.** Live Preview adds `@codemirror/lang-markdown`, `@lezer/markdown`, and the decoration code — roughly ~100KB gzipped on top of the current bundle. Acceptable but worth noting.
- **Live Preview correctness on tables.** GFM tables are the hardest case for the cursor-on-line rule because a table is a multi-line structure. v1 accepts the compromise that tables render normally but show full source on the active line and any line in the same table when the cursor is anywhere inside it.
- **Turndown on weird legacy HTML.** ContentEditable produces inconsistent HTML across browsers and years. The `legacy_html_content` column is the safety net. The transition release also ships a "Re-run conversion" button in Settings so a user can replay the conversion for a note if the first pass looked wrong.
