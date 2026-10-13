// Yalnızca tarayıcıda arayüz testi için (Electron olmadan).
import { resolve } from 'path'
import { createReadStream, existsSync, statSync } from 'fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Büyük ONNX modelleri uygulama paketine girmesin diye dev-models/ altında; burada /models/ altında sunulur.
const devModels = (): Plugin => ({
  name: 'dev-models',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const m = req.url?.match(/^\/models\/([\w.-]+\.(onnx|data))$/)
      if (!m) return next()
      const file = resolve(__dirname, 'dev-models', m[1])
      if (!existsSync(file)) return next()
      res.setHeader('Content-Length', statSync(file).size)
      res.setHeader('Content-Type', 'application/octet-stream')
      if (req.method === 'HEAD') return res.end()
      createReadStream(file).pipe(res)
    })
  }
})

export default defineConfig({
  root: 'src/renderer',
  resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src'), '@shared': resolve(__dirname, 'src/shared') } },
  plugins: [react(), devModels()],
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  server: { port: 5198, strictPort: true }
})
