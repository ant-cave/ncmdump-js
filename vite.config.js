import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 库模式构建:同时产出 ESM / CJS / UMD 三份产物
// UMD 用于 <script> 标签直接引入,依赖已打包进产物,无需额外安装
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    lib: {
      entry: 'src/index.js',
      name: 'NcmDump',
      formats: ['es', 'cjs', 'umd'],
      fileName: (format) => {
        if (format === 'es') return 'ncmdump.js'
        if (format === 'cjs') return 'ncmdump.cjs'
        return 'ncmdump.umd.min.js'
      },
    },
    outDir: 'dist',
    minify: 'esbuild',
  },
})
