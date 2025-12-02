import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

console.log('Building sidebar...');

if (!existsSync('sidebar')) {
  mkdirSync('sidebar', { recursive: true });
}

try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('\n✅ Build complete!');
  console.log('Next steps:');
  console.log('1. Go to chrome://extensions/');
  console.log('2. Click reload on your extension');
  console.log('3. Refresh any webpage to see the sidebar');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}

