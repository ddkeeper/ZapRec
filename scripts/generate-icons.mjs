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

async function generateIcons() {
  // SVG 图标定义
  const svgIcon = `
    <svg width="512" height="512" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#020617"/>
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      <!-- 底座 -->
      <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#bg)" stroke="#334155" stroke-width="1" stroke-opacity="0.5"/>
      
      <!-- 扫描准星 -->
      <g stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round">
        <path d="M16 22 L16 16 L22 16"/>
        <path d="M42 16 L48 16 L48 22"/>
        <path d="M16 42 L16 48 L22 48"/>
        <path d="M42 48 L48 48 L48 42"/>
      </g>
      
      <!-- 闪电 -->
      <path d="M33 26 L28 35 L33 35 L31 44 L38 33 L33 33 L36 26 Z" fill="#3b82f6" stroke="#60a5fa" stroke-width="1" transform="rotate(5 32 32)"/>
      <path d="M33 28 L30 34 L33 34 L32 40" fill="#93c5fd" opacity="0.7" transform="rotate(5 32 32)"/>
    </svg>
  `

  const svgBuffer = Buffer.from(svgIcon)

  // 生成不同尺寸的 PNG
  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsDir, `icon-${size}x${size}.png`))
    console.log(`Generated ${size}x${size}.png`)
  }

  // 生成 256x256 用于 Windows 任务栏（Windows 会自动缩放）
  await sharp(svgBuffer)
    .resize(256, 256)
    .png()
    .toFile(path.join(iconsDir, 'icon.png'))
  console.log('Generated icon.png (256x256)')

  // ICO 格式用于 Windows（包含多个尺寸）
  const icoSizes = [16, 32, 48, 256]
  const icoBuffers = await Promise.all(
    icoSizes.map(async (size) => {
      return sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toBuffer()
    })
  )

  // 创建简单的 ICO 文件（使用第一个 PNG 作为占位符）
  // 实际 ICO 生成需要额外的库，这里使用 PNG 重命名为 .ico
  // Electron for Windows 可以直接使用 PNG
  await sharp(svgBuffer)
    .resize(256, 256)
    .png()
    .toFile(path.join(iconsDir, 'icon.ico.png'))
  
  fs.copyFileSync(
    path.join(iconsDir, 'icon.png'),
    path.join(iconsDir, 'icon.ico')
  )
  console.log('Generated icon.ico (256x256 PNG)')

  // macOS ICNS 需要特殊处理，这里生成 512x512 PNG
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, 'icon.icns.png'))
  console.log('Generated icon.icns.png (512x512 PNG for macOS)')

  console.log('\n✅ All icons generated successfully!')
  console.log(`Icons saved to: ${iconsDir}`)
}

generateIcons().catch(console.error)
