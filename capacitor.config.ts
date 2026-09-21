import type { CapacitorConfig } from '@capacitor/cli';

// إعداد تطبيق بمبا | توقعات للأجهزة
const config: CapacitorConfig = {
  appId: 'com.bmba.predictions',
  appName: 'بمبا توقعات',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;