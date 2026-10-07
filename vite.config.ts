import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // works under https://<user>.github.io/<repo>/
  optimizeDeps: { exclude: ['@imgly/background-removal'] },
  build: { target: 'es2022' },
});
