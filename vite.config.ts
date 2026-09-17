import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // بيئة الاستضافة تمرر HOST و PORT كمتغيرات بيئة — بدونها يعمل التطوير على 5173 محلياً
  server: {
    host: process.env.HOST || true,
    port: Number(process.env.PORT) || 5173,
    // اسمح بعناوين المعاينة/الإنجرس (تتغير بين البيئات) — سجل الدخول لا يتأثر
    allowedHosts: true,
  },
});
