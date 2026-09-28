
import sharp from 'sharp';
import fs from 'fs';

async function convertIcon(svgPath, pngPath, size) {
  try {
    const svgBuffer = fs.readFileSync(svgPath);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(pngPath);
    console.log(`✅ Created ${pngPath} (${size}x${size})`);
  } catch (error) {
    console.error(`❌ Failed to convert ${svgPath}:`, error.message);
  }
}

async function main() {
  await convertIcon('public/icon-192.svg', 'public/icon-192.png', 192);
  await convertIcon('public/icon-512.svg', 'public/icon-512.png', 512);
  console.log('\n🎉 Icon conversion complete!');
}

main();
