import sharp from 'sharp'
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const src = 'public/Logo-oficial-azul.png'
const orig = 'public/Logo-oficial-azul-original.png'
const dst = 'public/Logo-oficial-azul.png'

if (!existsSync(orig)) {
  await copyFile(src, orig)
  console.log('saved original to', orig)
}

const img = sharp(orig)
const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width, height, channels } = info

// The navy panels in the logo are very dark blue-dominant pixels.
// Keep: gold trophy (R>G>B, bright), white/cream text (all channels high),
//       lighter "25" blue (R+G+B brighter than navy), red outlines.
let removed = 0
for (let i = 0; i < data.length; i += channels) {
  const r = data[i], g = data[i + 1], b = data[i + 2]
  const brightness = (r + g + b) / 3
  // Navy panel (dark) OR the bright "25" blue shapes — both are blue-dominant.
  // Trophy = gold/cream (R>=G>B), text white (all high) — neither matches "blue-dominant".
  const blueDominant = b > r + 20 && b > g + 10
  const isBackground = blueDominant && brightness < 170
  if (isBackground) {
    data[i + 3] = 0
    removed++
  }
}

console.log(`pixels removed: ${removed}/${width * height} (${((removed / (width * height)) * 100).toFixed(1)}%)`)
await sharp(data, { raw: { width, height, channels } }).png().toFile(dst + '.tmp')
await writeFile(dst, await readFile(dst + '.tmp'))
console.log('written', dst)
