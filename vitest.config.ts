// Birim testleri: saf işlevler (tarayıcı, ekran kartı ya da model gerektirmez). npm test
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src'), '@shared': resolve(__dirname, 'src/shared') } },
  define: { __APP_VERSION__: JSON.stringify('test') },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' }
})
