# Typhoonpost Documents: word processor plan

Status: release 1a (early) is built and in the beta; see section 12. The rest is plan only. The full feature list is in `word-processor-features.md`: 398 features across 18 areas. Decisions marked "Owner" need an answer before Phase 1.

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

The complete catalogue is `word-processor-features.md`: **398 features**, each tagged with its phase. By phase: P1 166, P2 112, P3 11, P4 24, P5 85. The lists below are the original summary and the catalogue supersedes them wherever they differ.

Because Phase 1 now holds 166 features, it is split into three releases that each ship on their own: **1a** (the writing essentials: formatting, styles, lists, tables, images, find and replace, autosave, document list, encrypted storage, PDF and Word export, about 90 features), **1b** (import, templates, version history, search, mail links, security items) and **1c** (the rest of Phase 1). The website only claims a feature once its release has shipped.

### Core writing (Phase 1)
- Rich text: the same formatting the composer offers, built again inside the Documents editor, plus strikethrough, small caps, line spacing, paragraph spacing, indents, block quotes, code blocks, horizontal rule, special characters.
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
| 0. Spikes | Layout core prototype on real documents with metric-compatible fonts, DOCX round-trip on 10 real files, 100-page performance, Yjs encrypted-update prototype with two browsers. Written findings, including the decision on a full custom renderer. | M |
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
8. **Beta group:** who gets early access (you, plus how many outside testers), and some of your real documents to use as fixtures.
9. **Screen-reader and real-device testers:** people who can test on Safari, iOS, Android and a screen reader.

## 10. Release quality: near-zero issues at launch

Honest target: zero defects cannot be promised for any software. The launch bar is **no data loss, no security flaw, no crash on supported documents, and a published list of known limits.** Everything below exists to hit that bar.

### Layout engine decision
We build our own **layout core**: the code that decides where lines and pages break, using real font measurements, written as pure functions with no browser dependency. The browser still draws the text, so selection, spell check, input methods and screen-reader access keep working. A full custom renderer (drawing everything ourselves) is only chosen if the Phase 0 spike shows the browser's drawing blocks accuracy, because it costs far more and removes those native features. Bundled metric-compatible fonts (Carlito for Calibri, Caladea for Cambria, Liberation for Arial, Times New Roman and Courier New) make line and page breaks match Word's far more often.

### Safety of the user's writing
1. Before every save, an encrypted copy of the current document is kept in the browser's local storage, so a dropped connection or a crash never loses text.
2. Saves carry a revision number; a conflicting save is detected and the user chooses, never silently overwritten.
3. Version snapshots run automatically and before risky operations (import, replace all, restore, accept all changes).
4. Every format change is versioned; old documents always open. A migration is tested on a fixture of every earlier version before it ships.
5. Failing closed: if decryption or a conversion fails, the document is untouched and the user sees a clear message.

### Test layers
- **Layout core:** deterministic golden files. A fixed set of documents is laid out and every page break is compared. Random document generation (fuzzing) checks it never crashes, never loops and gives the same result twice.
- **Fixture library:** the owner's real documents, documents made by Word, LibreOffice and Google Docs, and edge cases (very long tables, right-to-left text, emoji, nested lists, huge images). Every bug found becomes a permanent fixture.
- **Round trips:** import, export, import again; text and structure must survive on every fixture.
- **Visual regression:** screenshots of pages and the interface compared on every change, in Chromium, Firefox and WebKit.
- **Performance budgets:** typing latency under 50 ms on a 100-page document, open time and memory limits, tested on every change.
- **Security:** sanitiser fuzzing with hostile HTML, the encryption tests, and the outside review already planned for the platform.
- **Accessibility:** automated audits plus real screen-reader testing by people who use one daily.
- **Real devices:** Safari, iOS, Android and tablets, tested by invited testers because they cannot be reproduced from the development environment.

### Staged release
1. Feature flag, owner only.
2. Invited beta with real users and real documents.
3. Everyone, one release at a time (1a, 1b, 1c and so on), each after its exit criteria pass.

**Exit criteria per release:** zero known data-loss bugs, zero open crashes on the fixture library, all golden and round-trip tests passing, performance budgets met, accessibility audit clean, beta period with no new data-loss or security reports, and the known-limits list published.

### After launch
- Error reports carry only the error type, browser and a size bucket for the document. Never any document content, titles or file names. Opt-in.
- Each feature sits behind a flag so a problem can be switched off without a new release.
- A public known-limits page says what does not match Word.

## 11. Website and pricing implications

- Personal and Business pages gain a Documents section only when Phase 1 ships. Real-time co-editing and shared folders are Business features and appear on the Business page only when Phase 4 ships.
- Storage limits (5 GB Personal, 50 GB Business) now cover documents and images; the plan copy should say so.
- The existing rule stands: no "zero-access" wording on the site until the encryption Stage 5 column drop and outside review are done.

## 12. Documents release 1a (early) as built

Built at the owner's request so beta users can test it and give feedback. It is a first slice of release 1a, not the full 1a exit criteria in section 10; the staged-release gates still apply before it is announced publicly.

**In:** Docs screen in the app rail, separate from the composer (`src/documents/`, loaded on demand); document list with search, star, copy, trash, restore and delete forever; editor with Title, Subtitle, Heading 1 to 6, Quote; fonts, sizes, bold, italic, underline, strikethrough, super and subscript, colour, highlight; alignment, line spacing; bulleted, numbered and check lists with indent; tables (add and delete rows and columns, merge, split, header row, shading); images (inline, 3 MB each, alt text); links; block quote, code block, horizontal line; find and replace; A4 or Letter; word, character and selection counts; version history (about every ten minutes, and before a restore); export to Word, PDF (through the browser's print dialog), Markdown, HTML and text.

**Safety as built:** title, body and image data are encrypted in the browser (two records: a small one for the list, a body record opened only on open); an encrypted copy of unsaved work is kept on the device and recovered on reopen; saves carry a revision number and a conflicting save is detected and offered as keep-as-copy, replace or discard; a document over 10 MB is refused with a clear message; failures leave the document untouched.

**Not yet (later releases):** import (.docx, .md, .txt, .html), folders, templates, real pages with headers, footers and page numbers, comments and suggestions, sharing and co-editing, mail links (attach to a message, save a message as a document), encrypted persisted search. Images are stored inside the encrypted document, not as separate files. Print and Word page breaks will not match Word exactly until Phase 2. The beta group and real-document fixtures from decisions 8 and 9 are still needed.

**Tests:** 44 unit tests including encryption round trips, tamper and wrong-kind failures, Markdown, find, and a valid .docx built from every block type; a 19-step browser test covers create, type, autosave, no readable data sent or stored locally, table, find and replace, exports, reload, conflict, copy and trash.
