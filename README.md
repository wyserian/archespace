# ArcheSpace

[![CI](https://github.com/wyserian/archespace/actions/workflows/ci.yml/badge.svg)](https://github.com/wyserian/archespace/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/v/release/wyserian/archespace)](https://github.com/wyserian/archespace/releases)
[![Live](https://img.shields.io/badge/live-archespace.app-32d3aa)](https://archespace.app)
[![License](https://img.shields.io/github/license/wyserian/archespace)](LICENSE)

ArcheSpace is an open-source, encrypted space for capturing and organising your information, notes, projects, secrets, code, checklists and ideas. Group them into spaces, and fill each space with the content type that fits: plain notes, rich text documents, lists and checklists, tables, Kanban boards, code snippets and whiteboards. Anything sensitive can be protected so it only opens with your vault PIN. Everything is taggable, searchable and kept in one place, synced across your devices.

Privacy is built in, not bolted on. ArcheSpace is a self-hostable web app with Supabase sync and a client-side encrypted vault, so your content stays private even from the app's owner and developers. It follows a zero-knowledge architecture: everything is encrypted in your browser and the backend only ever stores ciphertext, so the server, its operators, and the developers never see your data in readable form.

A companion Mobile/Flutter app lives in a [separate repository](https://github.com/wyserian/archespace-mobile).

## Table of contents

- [Features](#features)
- [Item types](#item-types)
- [Security](#security)
- [Setup](#setup)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Releases](#releases)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Support](#support)
- [Credits](#credits)
- [License](#license)

## Features

- **Zero-knowledge encryption**: the server only ever stores ciphertext ([Security](#security))
- **Vault PIN** with a recovery code, auto-lock and passkey / biometric unlock
- **Protected** items and spaces, and **read-only** spaces
- **Spaces** with sub-spaces nested to any depth, tags and colours
- **Item types**: notes, rich text, lists, checklists, cards, tables, Kanban boards, whiteboards and code ([Item types](#item-types))
- **Reminders** that repeat or stay until turned off, all listed in one view
- **Search** across spaces, tags and content
- **Starred**, **archive** and **recycle bin**
- **Realtime sync** with the [mobile app](https://github.com/wyserian/archespace-mobile), and **offline mode**
- **Encrypted backups** and **PDF export**
- **Local mode**: no account, nothing leaves the browser
- **Two-factor sign-in**
- **Command palette** and keyboard shortcuts
- **Installable PWA**
- **Self-hostable** ([Setup](#setup))

## Item types

| Type | Description |
|------|-------------|
| Note | Free-form plain text. |
| Rich text | A full document editor: headings, bullet, numbered and task lists, quotes, code blocks, tables, links, highlight, text alignment, superscript and subscript, line spacing, and find and replace (with regular expressions). Pasted Markdown is converted to formatting as you paste. |
| List | Bullet or numbered list (a Numbered checkbox switches between them). |
| Checklist | Checkboxes with progress tracking. |
| Cards | Title and description pairs for planning. |
| Table | Rows and columns; copies as tab-separated values for spreadsheets. |
| Kanban | Cards in columns (To do, Doing, Done to start): drag a card between columns, or move it with the arrow keys; rename, move and delete columns. |
| Whiteboard | An Excalidraw board: shapes, arrows, text and freehand drawing on a canvas you can pan and zoom. |
| Code | Monospace snippet with automatic syntax highlighting. |

All list-style types support add, remove, and drag-and-drop or `Arrow Up` / `Arrow Down` reordering. Spaces and items reorder by drag-and-drop or `Alt` + `Arrow Up` / `Arrow Down`. Older item types are converted automatically after unlock: Markdown notes and older rich text become Rich text, and Secrets become Notes (protect them to keep them behind your PIN).

## Security

Two separate secrets: a **login password** for the account and a **vault PIN** (or passphrase) for the content.

- **Encrypted in the browser.** Content is encrypted with AES-256-GCM before it leaves the device; the server stores only ciphertext and non-sensitive metadata (IDs, timestamps, positions, flags).
- **PIN never stored.** A random vault key is wrapped with a key derived from the PIN by Argon2id.
- **Unlock.** The vault auto-locks when idle. Passkey / biometric unlock keeps its wrapped key on the device, never on the server.
- **Server-side guards.** Row Level Security limits each user to their own data, and optional two-factor sign-in is enforced by the database, not just the app. Repeated wrong PINs pause unlocking for a few minutes.
- **Protected items and spaces** need the PIN again inside an unlocked vault, as does erasing a local-mode vault: a guard against someone using your unlocked device.
- **Encrypted backups** open in the same vault, or anywhere with the PIN used when exporting.
- **No backdoor.** A one-time recovery code resets a forgotten PIN. Lose both and the data can't be recovered.

**Limits.** The PIN is what keeps the data private: anyone holding the wrapped key (a leaked backup file or database) can guess it offline, where no lockout applies. A new PIN needs at least 6 characters, and a passphrase is far stronger. Client-side encryption is only as safe as the code running it; Settings links the build to its source commit so you can verify it.

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Setup

```bash
git clone https://github.com/wyserian/archespace
cd archespace
npm install
```

1. **Supabase**: create a project, run `schema.sql` in the SQL Editor, enable the Email auth provider, and configure Resend as the SMTP server. Paste the templates from `email-templates/` into Auth > Email Templates, and add your app URL plus `https://your-domain/reset-password` to the redirect URLs.
2. **Account-deletion email** (server-side, via `pg_net` + Resend): enable `pg_net` (included in `schema.sql`), store your key with `select vault.create_secret('re_your_key', 'RESEND_API_KEY');`, and set the `v_from` / `v_support` addresses in `notify_account_deleted()` to a verified domain.
3. **Environment**: create `.env`:

   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

4. **Mode**: single-user is the default (create one user, keep sign-up disabled). For multi-user, set `VITE_ALLOW_SIGNUP=true`, enable Auth email sign-ups, and tighten the rate limits.

```bash
npm run dev      # development server
npm run build    # production build
npm run preview  # preview the build locally (Wrangler)
```

Deploys are automatic on Cloudflare's Git-connected builds: pushing to `main` runs `npm ci && npm run build` and deploys `dist/`. Any static host works too: build and serve `dist/` with an SPA fallback to `index.html` (`dist/404.html` is generated for hosts that need one).

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, React Router 7 |
| Build tooling | Vite 8, Vite PWA plugin (`vite-plugin-pwa`) |
| Styling | Tailwind CSS 3, CSS custom properties (theme mode and accent colours) |
| Data fetching / caching | TanStack Query 5 |
| Backend | Supabase Auth, Supabase PostgreSQL, Supabase Row Level Security, Supabase Realtime |
| Server-side email | `pg_net` + Resend HTTP API (account-deletion email), with the key in Supabase Vault |
| Auth email delivery | Resend SMTP (via Supabase Auth) |
| Encryption | Web Crypto API (AES-GCM), Argon2id key derivation via `@noble/hashes` |
| Rich text editor | Tiptap 3 (ProseMirror), shared with the mobile app as a bundled offline editor |
| Icons | Lucide React |
| Font | DM Sans, served by the app (no third-party font requests) |
| Whiteboard | Excalidraw, run offline (its fonts are served by the app) and shared with the mobile app as a bundled offline editor |
| Syntax highlighting | `highlight.js` (automatic language detection for the Code item type) |
| PDF export | `pdfmake` (export time and site URL in the header, page numbers in the footer) |
| Asset generation | `sharp` (dev-only script that renders the app icons and social image) |
| Hosting / deploy | Cloudflare (Git-connected builds), or any static host |
| CI / tooling | GitHub Actions (lint, test, build, audit), Vitest, Dependabot, ESLint 10 |

## Project structure

```text
archespace/
  .github/
    workflows/
  docs/
  email-templates/
  scripts/
  public/
    _headers
  src/
    assets/
    components/
      editors/
      layout/
      space/
      ui/
    context/
    hooks/
    lib/
      crypto/
      richText/
        webview/
      whiteboard/
        webview/
    pages/
    test/
    App.jsx
    index.css
    main.jsx
  schema.sql
  schema.test.sql
  eslint.config.js
  index.html
  package.json
  postcss.config.js
  tailwind.config.js
  vite.config.js
```

Key areas:

- `src/pages/` contains the public home page, login, password reset, dashboard, space view, archive, recycle bin, and settings pages.
- `src/components/` contains reusable UI (shared buttons, menus, type badges, dialogs), item editors, layout shell, vault unlock gate, and space components.
- `src/context/` contains auth, encryption, vault PIN prompt, appearance/theme, toast, shortcuts, command palette, and page action providers.
- `src/hooks/` contains data hooks for spaces, items, starred, reminders, archive, recycle bin, global search, offline sync, online status, drag reordering, and session timeout.
- `src/lib/richText/` contains the Tiptap editor setup (extensions, find and replace, line spacing), conversion of older notes, and `webview/`, the source of the offline editor bundled into the mobile app (`npm run build:mobile-editor`).
- `src/lib/whiteboard/` contains the Whiteboard's Excalidraw setup, its saved format (with a PNG preview for cards and PDFs), conversion of older drawings, and `webview/`, the source of the mobile app's offline whiteboard (built by the same command).
- `src/lib/crypto/` contains AES-GCM encryption, Argon2id key derivation, vault setup and unlock, non-extractable session key storage, PIN recovery code, and WebAuthn PRF passkey wrapping/unlock with a local (IndexedDB) passkey store.
- `src/lib/` contains the Supabase client, data protection helpers, item type definitions, protected-content state, clipboard serialization, encrypted backup import/export, offline queue and encrypted cache, connectivity detection, rate limiting, audit logging, two-factor (TOTP) and backup-code helpers, PDF export, password policy, and build info.
- `schema.sql` contains tables, indexes, RLS policies, triggers (including read-only spaces), RPC functions, realtime setup, vault recovery and PIN lockout, the `mfa_backup_codes` table with AAL2 enforcement for two-factor auth, the account-deletion email trigger, and the auth audit log. (Passkey unlock stores its wrapped key on each client, so there is no passkey table.)
- `schema.test.sql` checks the two-factor rules: run it on a test project after `schema.sql`; it rolls back everything it does.
- `email-templates/` contains ready-to-paste Supabase auth email templates; `scripts/generate-icons.mjs` renders the PWA icons and social image; `public/_headers` holds deployment headers for hosts such as Cloudflare Pages.

## Releases

The app version is derived from the git tag at build time (see `resolveVersion` in `vite.config.js`), so a release needs no manual version bump. To cut one, just tag and push:

```bash
git tag v1.2.3
git push origin v1.2.3
```

That triggers the release workflow (you can also run it manually from the Actions tab); the tag becomes the version shown in Settings and the footer.

Tagged releases are built reproducibly and published to GitHub Releases with SHA-256 checksums signed by [cosign](https://github.com/sigstore/cosign) (keyless, via GitHub OIDC), so anyone can confirm what a given tag builds to. Each release attaches `checksums.txt` (SHA-256 of every file in `dist/`), `checksums.txt.sig` and `checksums.txt.pem` (the cosign signature and certificate), and `archespace-<tag>-dist.tar.gz` (the built `dist/`).

**Verify the signature:**

```bash
cosign verify-blob \
  --certificate checksums.txt.pem \
  --signature checksums.txt.sig \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github.com/wyserian/archespace/.github/workflows/release.yml@' \
  checksums.txt
```

**Reproduce the build** (the Node version is pinned in `.nvmrc`):

```bash
git checkout <tag>
npm ci
SOURCE_DATE_EPOCH=$(git log -1 --format=%ct) npm run build
( cd dist && find . -type f -print0 | sort -z | xargs -0 sha256sum ) | diff - checksums.txt
```

An empty diff means your build matches the signed release byte for byte. Builds are deterministic because the timestamp is derived from the commit rather than the wall clock (see `resolveBuildTime` in `vite.config.js`).

## Roadmap

A living list of directions the project is exploring. These are intentions, not commitments or dates, and they may change. Ideas and contributions are welcome, so open an issue or start a discussion (see [Contributing](#contributing)).

- **First-party backend (exploring).** Today ArcheSpace runs on Supabase as a backend-as-a-service, covering the database, authentication, realtime sync, and server-side secret storage in one managed platform. A planned direction is a dedicated, self-contained backend that the project owns and ships itself, rather than depending on a single external provider. The goals are fewer moving parts for anyone self-hosting, a data layer that stays portable across databases and hosts, and full control over the auth and sync surface. This is a large change and would land incrementally, likely behind configuration so existing Supabase deployments keep working during the transition. The zero-knowledge design does not change: content is still encrypted in the browser and the backend still only ever stores ciphertext.
- **Other improvements** are tracked as issues on the repository. If there is something you want to see, propose it there.

## Contributing

Contributions are welcome: bug fixes, features, docs, and translations.

- Fork, branch off `main`, and open a focused pull request.
- Run `npm run lint`, `npm test`, and `npm run build` before submitting.
- For larger changes, schema changes, or security-relevant work, open an issue first.

Development questions: **[support@archespace.app](mailto:support@archespace.app)**.

## Support

Need help with setup, self-hosting, or account/vault recovery? Email **[support@archespace.app](mailto:support@archespace.app)** (include what you were doing, your deployment type, host, browser/OS, and any redacted errors), or open an issue for bugs and feature requests.

## Credits

- Built with React, Vite, Tailwind CSS, Supabase, TanStack Query, Tiptap, Lucide, pdfmake, and the Web Crypto API.
- Backend and authentication powered by Supabase.
- Hosted and deployed on Cloudflare.
- Email delivery powered by Resend.
- Source hosted on GitHub.
- Crafted and maintained by Wyserian.

## License

ArcheSpace is released under the MIT License. See [LICENSE](LICENSE).
