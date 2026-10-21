/**
 * generate-icons.mjs - One-off generator for the favicon, PWA icons and the
 * social share image, all rendered from the "A" mark with sharp. The app icon is
 * the mint "A" on a dark background (matching the mobile app); the favicon is
 * the bare mint "A".
 *
 * Run with: node scripts/generate-icons.mjs
 * Writes PNGs and SVGs into public/. Re-run only when the brand mark changes.
 */
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { A_PATH, GLYPH_VIEWBOX } from '../src/lib/brandPaths.js'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const MINT = '#32d3aa' // brand accent (the app's default theme colour)
const DARK = '#0d1117' // icon background

// The "A" mark placed at (x,y) with the given size in a 100-unit parent canvas.
const mark = (x, y, size, fill) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${GLYPH_VIEWBOX}"><path d="${A_PATH}" fill="${fill}" fill-rule="evenodd"/></svg>`

// Rounded-square icon: dark background, mint mark.
const roundedMark = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" rx="25" fill="${DARK}"/>
  ${mark(16, 18, 68, MINT)}
</svg>`

// Full-bleed icon for maskable / apple-touch: no transparent corners; the mark
// sits inside the safe zone so platform masking never clips it.
const solidMark = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="${DARK}"/>
  ${mark(24, 26, 52, MINT)}
</svg>`


// 1200x630 Open Graph / Twitter share card.
const ogImage = () => `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0f1117"/>
  <rect width="1200" height="6" fill="${MINT}"/>
  <g transform="translate(100,210)">
    <rect width="200" height="200" rx="48" fill="#151a23" stroke="${MINT}" stroke-width="2"/>
    <svg x="30" y="34" width="140" height="140" viewBox="${GLYPH_VIEWBOX}"><path d="${A_PATH}" fill="${MINT}" fill-rule="evenodd"/></svg>
  </g>
  <text x="360" y="300" font-family="Arial, sans-serif" font-size="76" font-weight="700" fill="#ffffff">ArcheSpace</text>
  <text x="362" y="360" font-family="Arial, sans-serif" font-size="30" fill="#aeb4c2">Everything in One Encrypted Space</text>
  <text x="100" y="560" font-family="Arial, sans-serif" font-size="26" font-weight="600" fill="${MINT}">archespace.app</text>
</svg>`

// Favicon: the bare mint mark on a transparent background, so browser tabs and
// search results draw it on their own background (a circle in search results).
// The glyph's exact edges (GLYPH_VIEWBOX has uneven padding), so it fills the
// favicon and sits dead centre.
const GLYPH_BOUNDS = '119 204 856 705'
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <svg x="0.5" y="0.5" width="31" height="31" viewBox="${GLYPH_BOUNDS}">
    <path d="${A_PATH}" fill="${MINT}" fill-rule="evenodd"/>
  </svg>
</svg>
`

const favicon = (size) => faviconSvg.replace('<svg ', `<svg width="${size}" height="${size}" `)

const pngBuffer = (svg) => sharp(Buffer.from(svg)).png().toBuffer()

const png = (svg, file) =>
  sharp(Buffer.from(svg)).png().toFile(join(publicDir, file))

// favicon.ico for the crawlers and browsers that ask for it by name: 16, 32 and
// 48px PNGs in one ICO container.
const ico = async (sizes) => {
  const images = await Promise.all(sizes.map(size => pngBuffer(favicon(size))))
  const header = Buffer.alloc(6 + 16 * sizes.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  sizes.forEach((size, i) => {
    const entry = 6 + 16 * i
    header.writeUInt8(size, entry)
    header.writeUInt8(size, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(images[i].length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += images[i].length
  })
  return Buffer.concat([header, ...images])
}

// Static SVGs.
writeFileSync(join(publicDir, 'favicon.svg'), faviconSvg)
writeFileSync(join(publicDir, 'favicon.ico'), await ico([16, 32, 48]))

await Promise.all([
  png(roundedMark(192), 'icon-192.png'),
  png(roundedMark(512), 'icon-512.png'),
  png(solidMark(512), 'icon-maskable-512.png'),
  png(solidMark(180), 'apple-touch-icon.png'),
  png(favicon(32), 'favicon-32.png'),
  png(favicon(96), 'favicon-96.png'),
  png(ogImage(), 'og-image.png'),
])

console.log(
  'Generated favicon.svg/.ico, favicon-32/96, icon-192/512, icon-maskable-512, apple-touch-icon, og-image'
)
