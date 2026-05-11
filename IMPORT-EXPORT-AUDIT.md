# Import / Export Audit

Scope: traced JSON/MD/TXT/PDF export and JSON/MD/TXT/ZIP import through `NoteImportExportService`, `FolderService`, `ZipImportHandler`, and `PDFExportModal`. This is an audit only; import/export code was not changed.

## Findings

1. `src/utils/NoteImportExportService.js:36`
   - Severity: high
   - Current behavior: Markdown and text export call `jsonToText`, which assumes old HTML `<div>` note content, removes the first split line as a title, and strips tags. For current markdown notes, this drops the first markdown line and otherwise returns mostly raw content by accident.
   - Recommended fix: branch on whether content is legacy HTML or markdown. For markdown, export the markdown string directly for `.md`; for `.txt`, strip markdown syntax intentionally.

2. `src/utils/NoteImportExportService.js:47`
   - Severity: high
   - Current behavior: PDF export processing assumes HTML content. Current markdown notes are treated as a single plaintext block, then `paragraphs.shift()` at line 109 removes the first line/body title. Markdown headings, lists, checkboxes, code, and links are not rendered as markdown.
   - Recommended fix: render markdown to sanitized HTML for PDF, or use CodeMirror/markdown parser output. Do not remove the first line unless title inclusion explicitly consumes it.

3. `src/utils/NoteImportExportService.js:379`
   - Severity: high
   - Current behavior: Markdown and text import wrap every imported line in HTML `<div>` elements. This reintroduces the pre-migration storage format into notes opened by the CodeMirror markdown editor.
   - Recommended fix: store imported `.md` content as markdown. For `.txt`, store plain text with a markdown title line only if product design wants filename-as-title.

4. `src/utils/NoteImportExportService.js:332`
   - Severity: medium
   - Current behavior: Markdown import converts markdown links and images to HTML tags before storage. That makes imported markdown less editable in the markdown editor and bypasses markdown preview behavior.
   - Recommended fix: preserve markdown syntax during markdown import. Only convert links/images when exporting to HTML/PDF.

5. `src/utils/NoteImportExportService.js:404`
   - Severity: medium
   - Current behavior: JSON export for unlocked notes preserves `content`, `dateModified`, `pinned`, and `locked`, but drops `dateCreated`, `caretPosition`, `parentFolderId`, `type`, `visibleTitle`, and server-side encrypted fields. Single-note JSON exports may not round-trip all app metadata.
   - Recommended fix: define a current JSON schema for note and folder export, including version metadata and all fields needed for round-trip restore.

6. `src/utils/NoteImportExportService.js:429`
   - Severity: high
   - Current behavior: encrypted JSON export expects client-side fields such as `keyParams` and `iv`. The current API serializer intentionally does not send encryption binary fields to the client, so encrypted JSON export cannot faithfully export server-encrypted notes.
   - Recommended fix: decide whether encrypted export is still supported in the Postgres/server-encryption model. If yes, expose a dedicated backend export endpoint; otherwise remove the client setting and document that encrypted notes must be exported decrypted after password verification.

7. `src/utils/NoteImportExportService.js:515`
   - Severity: medium
   - Current behavior: JSON import rejects items without `content`. Server-encrypted exports may intentionally omit plaintext `content`, and current encrypted JSON fields are no longer available client-side.
   - Recommended fix: make JSON import schema-aware. Accept valid folder objects, plaintext markdown notes, and only backend-supported encrypted payloads.

8. `src/utils/NoteImportExportService.js:524`
   - Severity: medium
   - Current behavior: folder title extraction still uses the old `<div>` regex. Markdown folder content or plain folder names can become `Untitled Folder`.
   - Recommended fix: use `NoteContentService.getFirstLine` or a shared markdown-aware title helper.

9. `src/utils/NoteImportExportService.js:688`
   - Severity: low
   - Current behavior: this path imports `storageService` from the compatibility shim, which now delegates to `ApiService`, so basic saves should still hit Postgres. The import name is stale but functional.
   - Recommended fix: rename imports to `apiService` or a neutral persistence service after migration cleanup.

10. `src/utils/ZipImportHandler.js:177`
    - Severity: high
    - Current behavior: ZIP import formats `.md` and `.txt` files as HTML `<div>` content, including markdown link/image conversion to HTML. Imported ZIP notes will not be native markdown notes.
    - Recommended fix: reuse the same markdown-native import formatter as regular `.md` import.

11. `src/utils/ZipImportHandler.js:40`
    - Severity: medium
    - Current behavior: folder and note IDs are generated from file dates plus a small random offset. Multiple entries with identical timestamps can still collide, especially in ZIP archives.
    - Recommended fix: use a collision-checked ID generator or let the backend allocate IDs for imports.

12. `src/utils/folderUtils.js:64`
    - Severity: medium
    - Current behavior: folder PDF download is routed to JSON export, because `fileType === 'json' || fileType === 'pdf'` both call `downloadNote({ fileType: 'json' })`.
    - Recommended fix: either disable folder PDF export explicitly or implement real folder PDF rendering.

13. `src/utils/folderUtils.js:83`
    - Severity: medium
    - Current behavior: folder ZIP export uses HTML-regex folder names and `formatNoteContent` for markdown/text children, so markdown-native child notes lose their first line in `.md`/`.txt` output.
    - Recommended fix: use markdown-aware title extraction and markdown-native child export.

14. `src/components/PDFExportModal.jsx:101`
    - Severity: low
    - Current behavior: the scale control is disabled and labeled unavailable, but export still passes `settings.scale / 100`. This is internally consistent but confusing in audit terms.
    - Recommended fix: either remove scale from the export payload while disabled, or enable and test the control.

## Path Status

- JSON backup export: likely works as a raw backup of server-returned note objects, but encrypted server fields are not included and schema is undocumented.
- Single JSON export: works for simple plaintext notes, but metadata round-trip is incomplete.
- Markdown export: broken for markdown-native notes because it assumes HTML and drops the first line.
- Text export: broken/risky for markdown-native notes for the same reason; plain text stripping is not markdown-aware.
- PDF export: works only as a crude plaintext export for markdown-native notes; markdown rendering is not preserved.
- JSON import: likely works for older plaintext JSON, but stores legacy HTML and cannot restore server-encrypted notes.
- Markdown import: works mechanically, but stores legacy HTML instead of markdown.
- Text import: works mechanically, but stores legacy HTML instead of plain markdown-editor text.
- ZIP import: works mechanically for simple archives, but imports content as legacy HTML and has collision risk.
