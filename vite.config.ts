import { defineConfig } from 'vite';

// base 用相对路径：本地运行和发布到 GitHub Pages（网址带 /sanguo/ 前缀）都能正常加载。
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
