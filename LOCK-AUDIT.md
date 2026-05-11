# Lock / Unlock Audit

Scope: traced PasswordModal -> PasswordModalUtils -> encryption.js -> NoteUpdateService -> StorageService/ApiService -> Django/Postgres. This is an audit only; no lock/unlock behavior was changed.

## Findings

1. `backend/peridot/views.py:118`
   - Severity: high
   - Current behavior: `_extract_title` and `_extract_preview` still parse old `<div>...</div>` HTML. Markdown notes without HTML wrappers fall through to "entire note content stripped of tags", so locking a markdown note can store the full plaintext note body as `visible_title`.
   - Recommended fix: replace server-side extraction with markdown-aware first non-empty line extraction, strip leading ATX heading markers, and use the rest of the markdown lines for preview. Apply the same helper when locking, saving, permanently unlocking, importing, and creating notes.

2. `src/utils/PasswordModalUtils.js:104`
   - Severity: critical
   - Current behavior: unlocking a note dispatches `noteUpdate` with the decrypted note. `App.jsx` consumes `noteUpdate` by replacing the note in React state, which can put plaintext content in the global notes array and sidebar-facing state.
   - Recommended fix: do not publish decrypted note bodies through global note update events. Return decrypted content only to `MainContent` or a scoped unlock state, and keep global note state locked/encrypted.

3. `src/utils/PasswordModalUtils.js:138`
   - Severity: high
   - Current behavior: folder unlock calls `apiService.unlockNote` and only dispatches `folderUnlocked`. It does not apply the returned `note` with `isOpen: true` to the global notes array. Components that do not listen to `folderUnlocked` can still see the folder as closed/locked.
   - Recommended fix: create a single folder-unlock state path that updates `isOpen` in React state without persisting an unlock as a permanent server change.

4. `src/utils/PasswordModalUtils.js:145`
   - Severity: high
   - Current behavior: permanent folder unlock treats `apiService.unlockNotePermanent` as if it returns a note object directly. `ApiService.unlockNotePermanent` returns the raw response object, while the backend returns a serialized note for folders and `{success: true}` style data is not normalized.
   - Recommended fix: normalize `unlockNotePermanent` return shape in `ApiService` and have modal utilities dispatch only serialized note objects.

5. `src/utils/ApiService.js:115`
   - Severity: medium
   - Current behavior: locked-note saves include the note password in the JSON API payload whenever plaintext content changes. This is necessary for the current server-side encryption design, but passwords are still sent plaintext over the app protocol.
   - Recommended fix: require HTTPS outside local development and document this explicitly. Longer term, consider deriving a wrapping token/session capability server-side after unlock so repeated saves do not resend the password.

6. `src/utils/ApiService.js:159`
   - Severity: medium
   - Current behavior: note passwords are cached in `ApiService._sessionPasswords` for the tab lifetime. They are not persisted to OPFS/IndexedDB/localStorage, but any XSS in the page can read them.
   - Recommended fix: keep the in-memory-only approach, shorten retention where possible, and clear per-note passwords when a note is deselected or relocked. Prioritize XSS hardening because session passwords are intentionally reachable by frontend code.

7. `src/utils/PasswordStorageService.js:1`
   - Severity: low
   - Current behavior: the old password-storage service is now a shim over `ApiService._sessionPasswords`. This is acceptable for no-disk persistence, but the old service name makes audits and call sites easy to misread.
   - Recommended fix: remove or rename the shim after migration, and update import sites to use explicit session-password API names.

8. `src/utils/StorageService.js:1`
   - Severity: low
   - Current behavior: browser storage is no longer used for notes; the compatibility shim delegates to `ApiService`. This matches the Postgres intent, and I did not find active OPFS/IndexedDB/localStorage note persistence in the current storage path.
   - Recommended fix: keep the shim only until old imports are cleaned up, then delete stale storage settings/UI that imply user-selectable local note storage.

9. `backend/peridot/views.py:254`
   - Severity: medium
   - Current behavior: folder locking stores only an encrypted verification blob, not encrypted folder metadata or child contents. This matches the current backend comments, but it means a locked folder is an access-control UI state rather than content encryption.
   - Recommended fix: decide whether folder lock should encrypt child notes or only gate UI access. If the intent is encryption, implement child-note encryption server-side as an explicit migration.

10. `src/utils/NoteImportExportService.js:303`
    - Severity: medium
    - Current behavior: encrypted download still checks a client-side password cache before decrypting. With server-side encryption, this can reject valid passwords when the session cache is empty, unless the bypass setting is enabled.
    - Recommended fix: remove client-side password verification from download flows and let the backend validate passwords.

## Sensitive Storage Summary

- Auth token: persisted in `localStorage` as `peridot.authToken` (`src/utils/ApiService.js:10`). This is a bearer token and should be treated as sensitive; logout removes it.
- Note passwords: held in memory in `ApiService._sessionPasswords` (`src/utils/ApiService.js:14`), not persisted to OPFS/IndexedDB/localStorage in the current code.
- Decrypted note contents: not intentionally persisted by StorageService, but can enter global React state on unlock via `PasswordModalUtils` (`src/utils/PasswordModalUtils.js:104`). That is the biggest current leak risk.
- User preferences: theme, preferred file type, JSON encrypted export flag, skip password verification, and editor zoom are persisted in `localStorage`. These are not note secrets, except `skipPasswordVerification` weakens encrypted export behavior.

## Resolution

- Replaced backend title/preview extraction with markdown-aware helpers that preserve legacy HTML handling but derive `visibleTitle` from the first markdown line for create, save, lock, and permanent unlock paths.
- Removed the global `noteUpdate` dispatch of decrypted note bodies from modal unlock. Temporary decrypted content now goes through a scoped `noteUnlockedForEditor` event consumed by `MainContent`, keeping the global notes array on the locked/server-serialized shape.
- Normalized `ApiService.unlockNotePermanent()` so callers receive the serialized note object, and updated folder unlock to dispatch the returned folder with `isOpen: true` into React state without persisting the transient open state as an unlock.
- Stopped caching a password during `lockNote`; session passwords are now stored only after a successful server unlock for save re-encryption.
- Removed client-side password verification from encrypted download flows. Locked-note downloads now ask the backend to validate and decrypt for the requested export.
- Removed the UI settings for client encrypted JSON export and password-verification bypass because server-side encrypted fields are not available to the browser.

Deferred:
- HTTPS enforcement outside local development is still deployment/configuration work.
- Folder locking remains a UI access-control gate with an encrypted verification blob; child-note encryption for folders would need a separate migration/design.
- The compatibility `PasswordStorageService` and `StorageService` shims still exist for older import sites.
