import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'

const src = 'public/sponsors-banner.png'
const dst = 'public/sponsors-banner.png'

const img = sharp(await readFile(src))
const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width, height, channels } = info

// Background = dark navy gradient. Convert any pixel where the dominant
// channel is blue and overall darkness is high into transparent.
// Logos use white/cyan/green/yellow/red — none of those satisfy the rule.
let removed = 0
for (let i = 0; i < data.length; i += channels) {
  const r = data[i], g = data[i + 1], b = data[i + 2]
  const brightness = (r + g + b) / 3
  const blueDominant = b > r + 8 && b > g + 4
  const dark = brightness < 90
  if (dark && blueDominant) {
    data[i + 3] = 0
    removed++
  } else if (brightness < 60 && b > r) {
    // very dark blue edges
    data[i + 3] = 0
    removed++
  }
}

console.log(`pixels removed: ${removed}/${(width * height)} (${((removed / (width * height)) * 100).toFixed(1)}%)`)

await sharp(data, { raw: { width, height, channels } }).png().toFile(dst + '.tmp')
await writeFile(dst, await readFile(dst + '.tmp'))
console.log('written', dst)
