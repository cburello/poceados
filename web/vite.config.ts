import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Control de Poceados',
        short_name: 'Poceados',
        description: 'Controlá tus jugadas de Quini 6, Loto Plus y demás poceados',
        lang: 'es-AR',
        start_url: '/',
        display: 'standalone',
        background_color: '#E8EAE3',
        theme_color: '#13181B',
        icons: [
          { src: '/icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icono-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // El motor de control vive en el backend y se importa desde acá.
      // Una sola implementación, no dos que se desincronizan.
      '@dominio': new URL('../src', import.meta.url).pathname,
    },
  },
  server: {
    port: 5173,
    // Permite leer los archivos del backend, que están fuera de web/
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
