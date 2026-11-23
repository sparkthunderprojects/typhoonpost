# Typhoonpost Documents: word processor plan

Status: plan only. Nothing is built. Decisions marked "Owner" need an answer before Phase 1.

## 1. What we are building

A full word processor inside Typhoonpost, next to Mail, Calendar, People and Tasks. Working name: **Documents** (rail item "Docs"). It must be good enough that a person writes a letter, a report or a contract in it without opening another app, and it must keep the promise the rest of the platform makes: stored content is ciphertext the server cannot read.

Out of scope for this plan: spreadsheets and slides, AI writing features that send text to a server, and public web pages published from a document.

## 2. Separate from the email composer

Documents is its own part of the product, not a bigger composer. The composer stays a light editor for writing messages and is not changed by this work.

- **Own module.** All code lives in `src/documents/` (editor, toolbar, page view, document list, import and export, storage). The composer's `RichTextEditor.tsx` is not imported, extended or modified.
- **Own screen.** A "Docs" item in the app rail opens a full-screen workspace with its own document list and editor. Nothing opens inside the mail window.
- **Own editor.** A separate TipTap instance with its own schema (pages, styles, comments, footnotes) built for documents. TipTap is already installed, so the only thing shared with the composer is the library and the existing crypto, not any editor code.
- **Own data.** Separate tables, separate encrypted record kind, separate storage paths. Deleting or breaking a document cannot touch mail.
- **Own bundle.** Loaded on demand, so mail does not get slower or larger for people who never open Docs.
- **Only deliberate links to mail.** Attach a document to a message, save a message as a document, and send a document as a message. Each is an explicit action that passes a finished file or text across, never a shared editor.

Reasons to keep TipTap/ProseMirror: it is already in the project, its document model is a real schema (needed for Word export and comments), and Yjs binds to it for collaboration.

## 3. Rules that do not bend

1. **Zero-access at rest.** A document is one encrypted record, same envelope family as contacts, events and tasks (`encryptRecord('doc', ...)`, new kind bound in as associated data). Title, body, images, comments and version history are all inside ciphertext. Readable columns: id, owner, timestamps, size, folder id, trashed flag.
2. **Keys stay in the browser.** Each document has its own content key, sealed to the owner's public key. Sharing seals that key to each collaborator's public key, using the same key lookup mail already uses.
3. **No server-side processing of content.** Search, word count, export, import, spell check, find and replace all run in the browser. No third-party scripts, fonts or APIs that see text.
4. **Sharing is Typhoonpost-to-Typhoonpost only.** A document cannot be shared with an outside address without giving up the guarantee. Outside people get an exported file, sent as an attachment from the existing attachment path (which today is Typhoonpost recipients only; external attachments are a separate, later item).
5. **The website says only what is live.** Nothing on the Personal or Business pages claims Documents until the phase that ships it.

## 4. Feature set

### Core writing (Phase 1)
- Rich text: all formatting already in the editor, plus strikethrough, small caps, line spacing, paragraph spacing, indents, block quotes, code blocks, horizontal rule, special characters.
- Named styles: Normal, Title, Subtitle, Heading 1 to 6, Quote. Changing a style changes every use.
- Lists: bulleted, numbered (multi-level, restart), checklists.
- Tables: insert, resize, merge and split cells, header row, cell shading, borders.
- Images: insert, resize, wrap-free inline placement and alignment, alt text, caption. Stored as encrypted files in the existing attachments bucket (same per-file key scheme).
- Links and bookmarks, with the privacy engine's link cleaning on paste.
- Find and replace (case, whole word, regex off by default).
- Undo and redo history, autosave (queued, like drafts), word, character and reading-time count, selection counts.
- Spell and grammar check using the browser's own spell checker only.
- Document list: folders, recent, starred, trash with restore, rename, duplicate, search (client-side, same engine as mail).
- Templates: blank, letter, meeting notes, report, CV, invoice. Stored in the app, not on a server.
- Version history: encrypted snapshots on a schedule and on demand; restore and compare.
- Import: .docx, .md, .txt, .html. Export: .docx, .pdf, .md, .html, .txt.

### Page layout (Phase 2)
- Page view with real pages: size (A4, Letter, Legal), orientation, margins, columns.
- Headers, footers, page numbers, different first page, section breaks, page breaks, keep with next, widow and orphan control.
- Table of contents from headings, footnotes and endnotes, cross references.
- Print preview that matches the export.

### Review (Phase 3)
- Comments anchored to text, with replies and resolve.
- Suggestions (track changes): insert and delete marked with author and time, accept and reject, accept all.

### Mail and platform integration (Phase 1 and 3)
- Attach a document to a message as .docx or .pdf; save a message (or a thread) as a document; send a document as the body of a new message.
- Create a task from selected text; add a document link to a calendar event.
- Command palette and keyboard shortcuts for every formatting action.
- Included in data export and in account deletion (stored files removed first, like attachments).

### Business (Phase 4)
- Shared documents and shared folders with roles: owner, editor, commenter, viewer.
- Real-time co-editing with presence cursors, built on Yjs with encrypted updates.
- Multi-user comments and suggestions, mentions that notify by mail.
- Admin settings: who may share outside the organisation (always only to Typhoonpost accounts), retention, ownership transfer when someone leaves.

### Later and optional (Phase 5)
Equations, drawings, citations and bibliography, mail merge from People, dictation (browser speech API only if it runs on-device), document outline sidebar, focus mode, custom templates for a team.

## 5. The hard parts, stated honestly

**Pagination.** A browser has no native concept of pages. Options: (a) continuous page-width flow with page-break markers (cheap, Phase 1); (b) true pagination by measuring node heights and drawing page boundaries with ProseMirror decorations (Phase 2). (b) is the biggest single piece of work in the plan and will never match Word exactly for complex layouts. Spike first (Phase 0) before promising "looks the same as Word".

**DOCX fidelity.** Export with the `docx` library and import with `mammoth` or a direct OOXML reader cover text, styles, lists, tables, images, headers and comments. Round trips will lose some things (complex floating objects, SmartArt, macros, exotic numbering). The UI must say so on import. Fidelity is measured against a fixed set of test files, not by feeling.

**Collaboration under encryption.** The server can relay and store Yjs updates but cannot read them. Consequences: no server-side merge or snapshot, so clients write encrypted snapshots; a collaborator removed from a document stops receiving future keys, but cannot be made to forget what they already saw; presence leaks who is online in a document, so it is optional per document. Needs a relay (Supabase Realtime broadcast to start) and a persisted update log trimmed by snapshots.

**Performance.** ProseMirror handles long documents, but encryption, snapshots and pagination do not come free. Target: 100 pages with images stays interactive; cap a document at a size we have tested, and show the limit.

**Search and index.** The client search already builds an in-memory index from decrypted data. Documents must not all be decrypted at start. Index titles and a trimmed text excerpt at save time, stored inside the encrypted record, and decrypt full bodies on open. Revisit the encrypted persisted index here, which Stage 4 deferred.

**Safety of pasted and imported content.** All imported and pasted HTML goes through DOMPurify with a document-specific allow list. Scripts, forms and remote images are never loaded; remote images in imports are dropped or fetched on the user's explicit choice.

## 6. Data model

All tables use row-level security limited to the owner or a listed member, plus the existing `require_mfa_when_enrolled` restrictive policy.

- `documents`: id, owner, enc_version, enc_payload (title, ProseMirror JSON or Yjs snapshot, page setup, excerpt), enc_key, folder_id, starred, trashed_at, size_bytes, created_at, updated_at.
- `document_versions`: id, document_id, enc_payload, enc_key, created_at, label. Pruned on a schedule.
- `document_members` (Phase 4): document_id, user_id, role, wrapped_key (document key sealed to that member), added_by, created_at.
- `document_updates` (Phase 4): id, document_id, enc_update, seq, created_at. Trimmed after each snapshot.
- `document_folders`: id, owner, enc_name or readable name decision (Owner), parent_id.
- Files: images use the `attachments` bucket under `<user id>/<file id>`; shared documents copy ciphertext objects the way `deliver-local` copies mail attachments.

Readable by the server: ids, owner and member ids, roles, timestamps, size, folder structure, trash state. Everything else is ciphertext.

## 7. Phases, in order

| Phase | Delivers | Size |
|-------|----------|------|
| 0. Spikes | Pagination prototype, DOCX round-trip on 10 real files, 100-page performance, Yjs encrypted-update prototype with two browsers. Written findings. | M |
| 1. Personal documents | Everything under Core writing, the rail item, encrypted storage, versions, import and export, mail integration, tests. | XL |
| 2. Page layout | Real pages, headers and footers, TOC, footnotes, print and PDF that match. | XL |
| 3. Review | Comments and suggestions for one author, then reviewers. | L |
| 4. Business | Sharing, roles, real-time co-editing, admin controls. Depends on Business accounts and the admin console existing. | XL |
| 5. Extras | Pick from the optional list by demand. | per item |

Sizes are relative effort (S, M, L, XL), not calendar time. Phase 4 cannot start until Business has people and roles, which are not built yet.

Each phase ships only when its tests pass and the spec has a "Documents phase N as built" section, as the encryption stages did.

## 8. Tests required

- Known-answer and round-trip tests for the `doc` record kind (wrong key, wrong kind, tampered ciphertext all fail closed).
- Database inspection proving no title, text or image name is stored readable.
- DOCX and PDF fixture suite: a fixed folder of real files, compared on text, structure and page count.
- Paste and import sanitisation tests with hostile HTML.
- Autosave under slow and dropped connections: no duplicate rows, no lost edits, no plaintext fallback.
- Browser tests (Playwright with the mock server) for create, edit, reload, restore version, export, attach to mail, delete.
- Collaboration (Phase 4): two clients converge after offline edits; a removed collaborator cannot read new updates; the relay only ever stores ciphertext.
- Accessibility: full keyboard operation, screen-reader labels on toolbar and page, high contrast.

## 9. Decisions for the owner

1. **Name:** Documents, Docs or Write.
2. **Pagination promise:** is Word-like page layout a launch requirement (Phase 2 before launch) or can Phase 1 ship as continuous flow with page breaks?
3. **Collaboration:** Business only (recommended), or also between two Personal accounts?
4. **Folder names:** encrypted (more private, no server-side folder listing sorted by name) or readable (simpler). Recommendation: encrypted.
5. **Size limit per document** and per account for stored documents and images.
6. **AI writing help:** none (recommended, keeps the promise), or on-device only later.
7. **Which import formats matter most** to your first users (.docx assumed).

## 10. Website and pricing implications

- Personal and Business pages gain a Documents section only when Phase 1 ships. Real-time co-editing and shared folders are Business features and appear on the Business page only when Phase 4 ships.
- Storage limits (5 GB Personal, 50 GB Business) now cover documents and images; the plan copy should say so.
- The existing rule stands: no "zero-access" wording on the site until the encryption Stage 5 column drop and outside review are done.
