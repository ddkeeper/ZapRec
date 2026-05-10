import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const iconsDir = path.join(__dirname, 'build')

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

const sizes = [16, 32, 48, 64, 128, 256, 512]

function generateSvg(size, variant = 'default') {
  const colors = variant === 'recording' 
    ? { ring: '#EF4444', dot: '#B91C1C', bg: '#FEF2F2' }
    : { ring: '#478A8F', dot: '#2C5F63', bg: '#F5F9F9' }

  const s = 64 
  const ringSize = s * 0.78
  const dotSize = s * 0.18
  const center = s / 2

  return `
<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="${s-2}" height="${s-2}" rx="${s*0.07}" 
        fill="${colors.bg}" 
        stroke="rgba(0,0,0,0.04)" 
        stroke-width="1"/>
  <circle cx="${center}" cy="${center}" r="${ringSize/2}" 
          fill="none" 
          stroke="${colors.ring}" 
          stroke-width="3.5"/>
  <circle cx="${center}" cy="${center}" r="${dotSize/2}" 
          fill="${colors.dot}"/>
</svg>
  `
}

async function generateIcons() {
  // Generate default icons
  for (const size of sizes) {
    const svg = Buffer.from(generateSvg(64, 'default'))
    await sharp(svg).resize(size, size).png().toFile(path.join(iconsDir, `icon-${size}x${size}.png`))
    console.log(`Generated icon-${size}x${size}.png`)
  }

  // Generate recording (red) icons
  for (const size of sizes) {
    const svg = Buffer.from(generateSvg(64, 'recording'))
    await sharp(svg).resize(size, size).png().toFile(path.join(iconsDir, `icon-${size}x${size}-red.png`))
    console.log(`Generated icon-${size}x${size}-red.png`)
  }

  // Default icon.png
  const svgDefault = Buffer.from(generateSvg(64, 'default'))
  await sharp(svgDefault).resize(256, 256).png().toFile(path.join(iconsDir, 'icon.png'))
  console.log('Generated icon.png')

  // icon.ico (use PNG for Electron)
  await sharp(svgDefault).resize(256, 256).png().toFile(path.join(iconsDir, 'icon.ico.png'))
  fs.copyFileSync(path.join(iconsDir, 'icon.png'), path.join(iconsDir, 'icon.ico'))
  console.log('Generated icon.ico')

  // icon.icns.png
  const svgIcn = Buffer.from(generateSvg(64, 'default'))
  await sharp(svgIcn).resize(512, 512).png().toFile(path.join(iconsDir, 'icon.icns.png'))
  console.log('Generated icon.icns.png')

  console.log('\n✅ All icons generated!')
}

generateIcons().catch(console.error)