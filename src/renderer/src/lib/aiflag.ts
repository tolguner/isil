// Üretken yapay zekâ (FLUX) sonucunun fotoğrafa işlenip işlenmediğini izler: generative.ts başarılı bir sonuçta
// işaretler, commitRaster bir sonraki kalıcı adıma params.ai olarak yazar, araç açılınca sıfırlanır.
// Dışa aktarmada bu bilgiyle "YZ ile düzenlendi" kaydı yazılır (lib/metadata.ts).
let pending = false
export const markGenerated = () => { pending = true }
export const resetGenerated = () => { pending = false }
export const takeGenerated = () => { const v = pending; pending = false; return v }
