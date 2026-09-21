// ينسخ شعار بمبا الرسمي ليكون أيقونة التطبيق (Launcher + Round + Splash) في مشروع أندرويد.
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const logo512 = join(root, 'public', 'assets', 'branding', 'bmba-icon-512.png');
const logo192 = join(root, 'public', 'assets', 'branding', 'bmba-icon-192.png');
const mipmaps = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const res = join(root, 'android', 'app', 'src', 'main', 'res');

if (!existsSync(logo512)) {
  console.error('الشعار غير موجود:', logo512);
  process.exit(1);
}

let copied = 0;

// أيقونات launcher/round — نفس الشعار بكل المقاسات (أندرويد يقيس تلقائياً)
for (const d of mipmaps) {
  const dir = join(res, 'mipmap-' + d);
  if (!existsSync(dir)) continue;
  const files = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'];
  for (const f of files) {
    copyFileSync(logo512, join(dir, f));
    copied += 1;
  }
}

// شاشة البداية (Splash) — نفس الشعار لكل المقاسات والأوضاع
const splashDirs = readdirSync(res).filter((n) => n.startsWith('drawable') && n.includes('splash') === false);
for (const d of splashDirs) {
  const p = join(res, d, 'splash.png');
  if (existsSync(p)) {
    copyFileSync(logo512, p);
    copied += 1;
  }
}

// صورة البداية الأساسية
const drawable = join(res, 'drawable');
mkdirSync(drawable, { recursive: true });
copyFileSync(logo512, join(drawable, 'splash.png'));
copyFileSync(logo192, join(res, 'mipmap-mdpi', 'ic_launcher.png'));
copyFileSync(logo192, join(res, 'mipmap-mdpi', 'ic_launcher_round.png'));
copied += 3;

console.log(`تم وضع شعار بمبا في ${copied} ملف داخل مشروع أندرويد.`);