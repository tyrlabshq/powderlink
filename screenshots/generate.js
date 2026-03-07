/**
 * TrailGuard App Store Screenshot Generator
 * 
 * Generates HTML mockups for 6.7" (iPhone 15 Pro Max: 1290×2796)
 * and 6.5" (iPhone 11 Pro Max: 1242×2688) App Store screenshots.
 * 
 * Run: node generate.js
 * Requires: npm install puppeteer (or use the HTML files directly)
 */

const SCREENS = [
  { id: 'map', title: 'Trail Map View' },
  { id: 'trail-detail', title: 'Trail Detail' },
  { id: 'trip-tracking', title: 'Trip Tracking' },
  { id: 'conditions', title: 'Conditions Report' },
];

const SIZES = [
  { label: '6.7inch', width: 1290, height: 2796, name: 'iPhone 15 Pro Max' },
  { label: '6.5inch', width: 1242, height: 2688, name: 'iPhone 11 Pro Max' },
];

console.log('TrailGuard screenshot assets:');
SIZES.forEach(size => {
  SCREENS.forEach(screen => {
    console.log(`  screenshots/${size.label}/${screen.id}.png (${size.width}×${size.height})`);
  });
});
console.log('\nOpen the HTML files in a browser to preview mockups.');
