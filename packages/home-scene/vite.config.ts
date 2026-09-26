import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/** Build a normal web site or a self-contained native WebView runtime. */
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  define: mode === 'native' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {},
  publicDir: mode === 'native' ? false : 'public',
  build: mode === 'native' ? {
    outDir: 'dist-native',
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    lib: {
      entry: fileURLToPath(new URL('./src/main.tsx', import.meta.url)),
      name: 'VantaHomeScene',
      formats: ['iife'],
      fileName: () => 'scene.js',
      cssFileName: 'scene',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  } : {
    rollupOptions: {
      output: { manualChunks: { three: ['three', '@react-three/fiber', '@react-three/drei'] } },
    },
  },
}));
