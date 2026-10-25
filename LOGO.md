# ArcheSpace logo usage

The "A" mark is the app icon, and it appears only as an icon. Everywhere else
the name is plain text: "ArcheSpace".

## Where the "A" appears

| Context                          | Form |
| -------------------------------- | ---- |
| Favicon (tabs, search results)   | Bare mint mark on transparent, so it sits on the browser's or search engine's own background; vector (`favicon.svg`), with `favicon.ico` for those that ask for it |
| PWA and Apple touch icon         | Mint mark on a dark rounded square (48-512px, each size drawn from the vector) |
| Link preview image (`og-image.png`) | The icon, large, beside the name |
| Reminder notifications           | The app icon (`icon-192.png`) |
| Android launcher icon and splash | Mint mark on a dark square |

## Where the name is text

The README, the home page footer and the account emails write "ArcheSpace" as
text. The PDF export carries no brand, only the site URL in its top-right
corner. Inside the app there is no logo.

## Rules

1. **One mark** - the "A" from `src/lib/brandPaths.js`; never hand-roll it.
2. **Only as an icon** - the mint mark on its dark square, or bare as the
   favicon; no mark on a page, and no wordmark.
3. **The name is text** - write "ArcheSpace" in the surrounding type instead
   of an image of it.

## Assets

Generated from the mark by `scripts/generate-icons.mjs` into `public/`:
`favicon.svg`, `favicon.ico`, `icon-48/96/144/192/256/512.png`,
`icon-maskable-512.png`, `apple-touch-icon.png` and `og-image.png`.
