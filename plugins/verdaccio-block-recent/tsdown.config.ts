import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm'],
  clean: true, // ビルド前にdistを掃除
  dts: false, // プラグイン自体に型定義ファイルは不要なのでOFF
});
