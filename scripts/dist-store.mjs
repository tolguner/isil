// Microsoft Store paketi (MSIX/AppX): node scripts/dist-store.mjs
// Ürün kimliği Partner Center → Ürün kimliği sayfasından alınır; store-identity.json (depoya girmez) ya da ortam
// değişkenleri ISIL_STORE_IDENTITY, ISIL_STORE_PUBLISHER, ISIL_STORE_PUBLISHER_NAME. Paketi Store imzalar.
import { existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'

const f = 'store-identity.json'
const id = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}
const v = {
  identityName: id.identityName ?? process.env.ISIL_STORE_IDENTITY,
  publisher: id.publisher ?? process.env.ISIL_STORE_PUBLISHER,
  publisherDisplayName: id.publisherDisplayName ?? process.env.ISIL_STORE_PUBLISHER_NAME
}
const missing = Object.entries(v).filter(([, x]) => !x).map(([k]) => k)
if (missing.length) { console.error('Store kimliği eksik:', missing.join(', ')); process.exit(1) }
const q = (s) => JSON.stringify(s)
// electron-builder'ın indirdiği eski makeappx bu bilgisayarda çalışmıyor (yan yana yapılandırma hatası): Microsoft'un
// imzalı Microsoft.Windows.SDK.BuildTools NuGet paketindeki x64 araçları ELECTRON_BUILDER_CACHE altındaki
// winCodeSign/windows-10/x64 klasörüne kopyalanırsa paketleme çalışır (bkz. DEVAM.md).
execSync('npx electron-vite build', { stdio: 'inherit' })
execSync(`npx electron-builder --win appx --publish never -c.appx.identityName=${q(v.identityName)} -c.appx.publisher=${q(v.publisher)} -c.appx.publisherDisplayName=${q(v.publisherDisplayName)}`, { stdio: 'inherit' })
