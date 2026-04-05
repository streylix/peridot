# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (localhost:5173)
npm run build        # Production build → dist/
npm run lint         # ESLint
npm test             # Vitest in watch mode
npm run test:ci      # Vitest single run with coverage
npm run coverage     # Coverage report
npm run deploy       # Build + deploy to GitHub Pages (gh-pages)
```

To run a single test file:
```bash
npx vitest run src/__tests__/App.test.tsx
```

## Architecture

Peridot is a fully client-side React note-taking app — no backend, no server. All data stays in the browser.

### Storage Layer (`src/utils/StorageService.js`)

The storage layer auto-selects from three backends with priority: **OPFS > IndexedDB > localStorage**. The user can override via Settings. All reads/writes go through the singleton `storageService`.

- OPFS: notes stored as `notes/{id}.json`, passwords as `passwords/{id}.pass`
- IndexedDB: two object stores — `notes` (keyPath: `id`) and `passwords` (keyPath: `noteId`)
- localStorage: `note_{id}` and `pass_{id}` keys

Writes are debounced (1ms) via a `pendingUpdates` Map. All pending saves are flushed synchronously on `beforeunload`.

### Note Update Flow

Edits in `NoteEditor` → `onUpdateNote()` in `MainContent` → `noteUpdateService.queueUpdate()` → debounced 200ms → `storageService.writeNote()` + fires `noteUpdate` CustomEvent → `App.jsx` listens and updates React state. If the note is currently unlocked (`isUnlocked`), `MainContent` passes an `encryptionContext` so the update service re-encrypts on save.

### Encryption (`src/utils/encryption.js`)

Notes use **AES-GCM 256-bit** keys derived via **PBKDF2** (100k iterations, SHA-256). Encrypted notes store `content` as a number array, plus `iv`, `keyParams` (`salt` + `iterations`), `locked: true`, `encrypted: true`, and a `visibleTitle` extracted before encryption so the sidebar can still display the note title.

`PasswordStorageService` stores passwords in OPFS `passwords/` for the session. `reEncryptNote()` is called by `StorageService` when writing a note that is `locked` but not yet `encrypted`.

**Folder locking** uses a different mechanism: a `verificationData` object is stored on the folder, containing an AES-GCM-encrypted copy of the constant string `"VALID_PASSWORD_VERIFICATION"`. Unlocking a folder decrypts this string to verify the password; the folder content itself is never encrypted.

### Note/Folder Data Model

Both notes and folders live in the same flat `notes` array in `App.jsx`. Folders are distinguished by `type: 'folder'`. Child items reference their parent via `parentFolderId`. Note IDs are `Date.now()` timestamps (numbers).

Key note fields: `id`, `content` (HTML string or encrypted number array), `dateModified`, `pinned`, `locked`, `encrypted`, `type`, `parentFolderId`, `caretPosition`, `visibleTitle` (only set when locked).

Folder-specific fields: `isOpen` (expanded state), `verificationData` (when locked).

### Content Format

Note content is stored as HTML with each line wrapped in `<div>`:
```html
<div>Title line</div><div>Second line</div><div><br></div>
```
`NoteContentService.getFirstLine()` extracts the title by parsing the first `<div>`. `getPreviewContent()` returns subsequent lines joined.

### Component Structure

- `App.jsx` — root state (notes array, selectedId, modals). Owns all note mutations.
- `Sidebar` — note/folder list, drag-and-drop between notes/folders, file import via drop, resizable (280px min, 75% max), collapsible. Uses `React.forwardRef` to expose `toggleSidebar()`.
- `FolderItem` — recursive folder rendering with nested `FolderItem` + `NoteItem`. Handles drag-drop into folders. Subscribes to `folderUnlocked` CustomEvent.
- `MainContent` — renders `NoteEditor`, `LockedWindow`, or `EmptyState`. Handles image drops into the editor. Checks for locked parent folders before showing note content.
- `NoteEditor` — `contentEditable` div. Debounces content updates (10ms). Saves and restores caret position across note switches.
- `Header` — breadcrumb title (e.g. `FolderName > NoteName`), back navigation, info/stats menus.
- `PasswordModal` — global singleton; subscribes to `passwordModalUtils` instead of receiving props. Handles 6 modal types: `lock`, `unlock`, `download`, `lockFolder`, `unlockFolder`, `unlockFolderPermanent`, `download-folder`.
- `Modal` / `ItemComponents` / `ItemPresets` — reusable modal system. `ItemComponents` are primitives (CONTAINER, SWITCH, DROPDOWN, TEXT, BUTTON, SUBSECTION); `ItemPresets` compose them into common patterns (TEXT_SWITCH, TEXT_DROPDOWN, TEXT_BUTTON, PASSWORD, PASSWORD_VERIFY).
- `ResponsiveModal` — renders `MobileModal` (full-screen slide-up) on ≤768px, `Modal` otherwise.
- `InfoMenu` — context menu (right-click or header button). Renders via React portal. Doubles as both the header toolbar menu and the sidebar right-click menu.
- `GifModal` — searches Giphy API, inserts selected GIF URL into note content.
- `Settings` — storage backend selector, theme, sort preferences, import/export/backup, storage diagnostics.

### Cross-Component Communication

Several interactions use `window.dispatchEvent` with CustomEvents rather than prop drilling:
- `noteUpdate` — fired by `NoteUpdateService` after every save; `App.jsx` and `Sidebar` both listen
- `openRenameModal` — fired from `InfoMenu` to open the rename modal in `App.jsx`
- `folderUnlocked` — fired when a folder is unlocked; `FolderItem` listens to update its local state

### Services (singletons in `src/utils/`)

| Service | Purpose |
|---|---|
| `storageService` | Read/write notes and passwords across OPFS/IndexedDB/localStorage |
| `noteUpdateService` | Debounced update queue + re-encryption on save |
| `noteContentService` | HTML content parsing (title, preview, PDF content extraction) |
| `noteImportExportService` | Export (JSON/MD/TXT/PDF) and import (JSON/MD/TXT) |
| `noteSortingService` | Sort notes: alpha, dateModified, dateCreated; respects `prioritizePinned` setting |
| `passwordStorage` | OPFS-only password persistence (always uses OPFS regardless of storage backend) |
| `passwordModalUtils` | Pub/sub controller for `PasswordModal` — open/close modal and handle all password operations |
| `noteNavigation` | Simple history stack for back button; notifies subscribers on change |
| `searchService` | Full-text search over title + preview; hides notes inside locked folders |
| `FolderService` | Folder CRUD, lock/unlock, ZIP/JSON export, rename |
| `ZipImportHandler` | Import ZIP archives, reconstructing folder hierarchy from directory structure |

### Testing

Tests use Vitest + jsdom + `@testing-library/react`. Setup at `src/test/setup.ts`. Test utilities and mock data at `src/test/test-utils.tsx`. Tests in `src/__tests__/`. The test suite mocks OPFS via `navigator.storage.getDirectory` returning in-memory `Map`-backed handles. Many tests are commented out and may be re-enabled; currently only sidebar toggle and note content persistence tests are active.

### Known Quirks

- `PasswordStorageService` always uses OPFS directly, independently of whatever backend `StorageService` selected. If the user switches to localStorage or IndexedDB, passwords still go to OPFS.
- `StorageService` has a duplicate `initIndexedDB` method definition (one opens `peridot_notes`, one opens `notesDB`); the second definition wins at runtime.
- `NoteItem` mutates the `note` object directly when computing `visibleTitle` (`note.visibleTitle = ...`).
- The GIF API key (`GkVHnnWLvZCSOlLfkGF1vyBilm4h4iCS`) is hardcoded in `GifModal.jsx`.
