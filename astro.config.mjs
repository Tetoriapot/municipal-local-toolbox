import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  base: process.env.BASE_PATH || '/',
  site: process.env.SITE_URL || undefined,
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
});
