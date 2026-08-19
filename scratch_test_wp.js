const { createCanvas, loadImage } = require('@napi-rs/canvas');
const db = require('./src/database');

async function test() {
  const userId = '1178342841882267744';
  const wp = db.getWallpaper(userId);
  console.log('User wallpaper in DB:', wp);

  try {
    const img = await loadImage(wp || 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=960&q=80');
    console.log('Image loaded successfully! Dimensions:', img.width, 'x', img.height);
  } catch (e) {
    console.error('Failed to load image:', e);
  }
}

test();
