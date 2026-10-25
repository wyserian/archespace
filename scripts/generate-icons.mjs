/**
 * generate-icons.mjs - One-off generator for the favicon, PWA icons and the
 * social share image, all rendered from the "A" mark with sharp. The app icon is
 * the mint "A" on a dark background (matching the mobile app); the favicon is
 * the bare mint "A".
 *
 * Run with: node scripts/generate-icons.mjs
 * Writes PNGs and SVGs into public/, and the mobile launcher icon sources when
 * the mobile repo sits next to this one. Re-run only when the brand mark changes.
 */
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, writeFileSync } from 'node:fs'
import { A_PATH, GLYPH_VIEWBOX } from '../src/lib/brandPaths.js'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const MINT = '#32d3aa' // brand accent (the app's default theme colour)
const DARK = '#0d1117' // icon background

// The mint "A", `width` units wide, centred in a `canvas`-unit square.
const mark = (width, canvas = 100) => {
  const at = (canvas - width) / 2
  return `<svg x="${at}" y="${at}" width="${width}" height="${width}" viewBox="${GLYPH_VIEWBOX}"><path d="${A_PATH}" fill="${MINT}" fill-rule="evenodd"/></svg>`
}

// A square icon `px` wide: the mark `width`% of it, on a dark square with
// corner radius `rx`%, or on nothing when `background` is null.
const icon = (px, width, { rx = 0, background = DARK } = {}) => `
<svg width="${px}" height="${px}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  ${background ? `<rect width="100" height="100" rx="${rx}" fill="${background}"/>` : ''}
  ${mark(width)}
</svg>`

// Rounded-square app icon.
const roundedMark = (px) => icon(px, 65.7, { rx: 25 })

// Full-bleed icon for maskable / apple-touch: no transparent corners; the mark
// sits inside the safe zone so platform masking never clips it.
const solidMark = (px) => icon(px, 50.2)

// 1200x630 Open Graph / Twitter share card. The icon is large so it still
// reads in the small thumbnails chat apps show.
const ogImage = () => `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0f1117"/>
  <rect width="1200" height="6" fill="${MINT}"/>
  <g transform="translate(100,165)">
    <rect width="300" height="300" rx="72" fill="#151a23" stroke="${MINT}" stroke-width="3"/>
    ${mark(203, 300)}
  </g>
  <text x="460" y="305" font-family="Arial, sans-serif" font-size="84" font-weight="700" fill="#ffffff">ArcheSpace</text>
  <text x="462" y="368" font-family="Arial, sans-serif" font-size="34" fill="#aeb4c2">Everything in One Encrypted Space</text>
  <text x="100" y="580" font-family="Arial, sans-serif" font-size="26" font-weight="600" fill="${MINT}">archespace.app</text>
</svg>`

// Favicon: the bare mint mark on a transparent background, so browser tabs and
// search results draw it on their own background (a circle in search results).
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${mark(96.9)}</svg>\n`

const favicon = (px) => icon(px, 96.9, { background: null })

const pngBuffer = (svg) => sharp(Buffer.from(svg)).png().toBuffer()

const png = (svg, file) =>
  sharp(Buffer.from(svg)).png().toFile(join(publicDir, file))

// favicon.ico for the crawlers and browsers that ask for it by name (others
// use favicon.svg, sharp at any size): 16, 32 and 48px PNGs in one ICO.
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

// App icons at every size an installed app is drawn at, each rendered from the
// vector mark rather than scaled down from a larger PNG (which blurs).
const APP_ICON_SIZES = [48, 96, 144, 192, 256, 512]

await Promise.all([
  ...APP_ICON_SIZES.map(size => png(roundedMark(size), `icon-${size}.png`)),
  png(solidMark(512), 'icon-maskable-512.png'),
  png(solidMark(180), 'apple-touch-icon.png'),
  png(ogImage(), 'og-image.png'),
])

// The mobile app's launcher icon sources, when its repo sits next to this one:
// the full icon, and the foreground of Android's adaptive icon (whose dark
// background is set in its pubspec.yaml).
const mobileIcons = join(publicDir, '../../archespace-mobile/assets/icon')
if (existsSync(mobileIcons)) {
  await Promise.all([
    sharp(Buffer.from(icon(1024, 82.7))).png().toFile(join(mobileIcons, 'app_icon.png')),
    sharp(Buffer.from(icon(1024, 62.4, { background: null }))).png().toFile(join(mobileIcons, 'app_icon_foreground.png')),
  ])
}

console.log(
  `Generated favicon.svg/.ico, icon-${APP_ICON_SIZES.join('/')}, icon-maskable-512, apple-touch-icon, og-image`
  + (existsSync(mobileIcons) ? ', and the mobile app_icon/app_icon_foreground' : '')
)
