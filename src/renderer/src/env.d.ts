// Derleme sırasında package.json sürümünden doldurulur (electron.vite.config.ts / vite.web.config.ts).
declare const __APP_VERSION__: string

// libheif-js'nin WebAssembly paketi (tipleri yok; lib/heic.ts kendi dar tipini kullanır)
declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  const factory: () => unknown
  export default factory
}
