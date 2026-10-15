# ArcheSpace logo usage

The "A" mark is the app icon, and it appears only as an icon. Everywhere else
the name is plain text: "ArcheSpace".

## Where the "A" appears

| Context                          | Form |
| -------------------------------- | ---- |
| Favicon (tabs, search results)   | Bare mint mark on transparent, so it sits on the browser's or search engine's own background |
| PWA and Apple touch icon         | Mint mark on a dark rounded square (180-512px) |
| Link preview image (`og-image.png`) | The icon beside the name |
| Home page phone illustration     | The app icon (`icon-192.png`, 32px) |
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
`favicon.svg`, `favicon.ico`, `favicon-32.png`, `favicon-96.png`,
`icon-192.png`, `icon-512.png`,
`icon-maskable-512.png`, `apple-touch-icon.png` and `og-image.png`.
