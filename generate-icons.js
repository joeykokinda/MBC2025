// ICON GENERATOR SCRIPT
// Generates extension icons (16x16, 48x48, 128x128 PNG files)
// 
// TO USE:
// Run: npm run generate-icons
// This creates icon files in assets/ folder
// 
// Icons are blue squares with white "P" letter
// You can customize colors and design in this file

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const assetsDir = resolve(process.cwd(), 'assets');
mkdirSync(assetsDir, { recursive: true });

const colors = {
  16: { r: 37, g: 99, b: 245 },
  48: { r: 37, g: 99, b: 245 },
  128: { r: 37, g: 99, b: 245 }
};

async function generateIcon(size) {
  const color = colors[size];
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="rgb(${color.r}, ${color.g}, ${color.b})" rx="${size * 0.2}"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.4}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">P</text>
    </svg>
  `;

  const png = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  return png;
}

async function main() {
  console.log('Generating icons...');
  
  const sizes = [16, 48, 128];
  
  for (const size of sizes) {
    const icon = await generateIcon(size);
    const filename = resolve(assetsDir, `icon${size}.png`);
    writeFileSync(filename, icon);
    console.log(`✅ Created icon${size}.png`);
  }
  
  console.log('\n🎉 All icons generated successfully!');
}

main().catch(console.error);
