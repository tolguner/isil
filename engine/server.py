# Işıl yerel üretken YZ sunucusu.
# Electron main süreci bunu yerel Python ile başlatır; stdin/stdout üzerinden satır başına bir JSON konuşur.
#   istek : {"id": 1, "cmd": "edit" | "chat" | "cancel" | "ping", ...}
#   yanıt : {"id": 1, "ok": true, "result": ...} | {"id": 1, "ok": false, "error": "..."}
#   ilerleme: {"id": 1, "progress": {"stage": "...", ...}}
# Görseller dosya yoluyla gelir/gider (main geçici klasörde tutar). Günlükler stderr'e yazılır.
import gc
import json
import os
import sys
import threading
import traceback

OUT = sys.stdout
sys.stdout = sys.stderr  # kütüphanelerin print'leri protokolü bozmasın
LOCK = threading.Lock()


def send(obj):
    with LOCK:
        OUT.write(json.dumps(obj, ensure_ascii=False) + "\n")
        OUT.flush()


def log(*a):
    print("[engine]", *a, file=sys.stderr, flush=True)


class Cancelled(Exception):
    pass


MODELS = os.environ.get("ISIL_ENGINE_MODELS", "")
# İptal bayrağı dosyadır: Windows'ta stdin'i başka iş parçacığında okumak, aynı tutamaca
# dokunan içe aktarmaları (GetFileType) kilitliyor; bu yüzden stdin yalnız ana döngüde okunur.
CANCEL_FILE = os.environ.get("ISIL_ENGINE_CANCEL", "")


class _Cancel:
    def is_set(self):
        return bool(CANCEL_FILE) and os.path.exists(CANCEL_FILE)

    def clear(self):
        if CANCEL_FILE and os.path.exists(CANCEL_FILE):
            try:
                os.remove(CANCEL_FILE)
            except OSError:
                pass


CANCEL = _Cancel()

torch = None
state = {"kind": None, "key": None, "pipe": None, "inpaint": None, "owner": None, "manual": False, "vlm": None, "proc": None}


def lazy_torch():
    global torch
    if torch is None:
        import torch as t

        torch = t
    return torch


def unload():
    ORT.clear()
    for k in ("pipe", "inpaint", "owner", "vlm", "proc"):
        state[k] = None
    state["kind"] = state["key"] = None
    gc.collect()
    if torch is not None and torch.cuda.is_available():
        torch.cuda.empty_cache()


# ---------- FLUX.2 klein ----------

def transformer_config(gguf_path, base_cfg):
    """GGUF tensör şekillerinden transformer yapılandırmasını çıkarır (9B'nin resmi deposu kayıt istiyor)."""
    import gguf

    r = gguf.GGUFReader(gguf_path)
    shapes = {t.name: [int(x) for x in t.shape] for t in r.tensors}
    dbl = 1 + max(int(n.split(".")[1]) for n in shapes if n.startswith("double_blocks."))
    sgl = 1 + max(int(n.split(".")[1]) for n in shapes if n.startswith("single_blocks."))
    # gguf şekilleri ters sıradadır: [in, out]
    hidden = shapes["img_in.weight"][1]
    ctx = shapes["txt_in.weight"][0]
    cfg = dict(base_cfg)
    cfg.update(
        num_layers=dbl,
        num_single_layers=sgl,
        num_attention_heads=hidden // cfg.get("attention_head_dim", 128),
        joint_attention_dim=ctx,
    )
    return cfg


def load_flux(key):
    if state["kind"] == "flux" and state["key"] == key:
        return state["pipe"]
    unload()
    t = lazy_torch()
    from diffusers import Flux2KleinPipeline, Flux2Transformer2DModel, GGUFQuantizationConfig
    from diffusers.quantizers.gguf.utils import dequantize_gguf_tensor
    from transformers import Qwen3ForCausalLM
    import gguf

    part = os.path.join(MODELS, key)
    common = os.path.join(MODELS, "flux-common")
    gguf_path = next(os.path.join(part, f) for f in os.listdir(part) if f.endswith(".gguf"))
    send({"id": CUR["id"], "progress": {"stage": "load"}})

    # transformer yapılandırması: GGUF'tan türetilir, ortak klasördeki 4B yapılandırması temel alınır
    cfg_dir = os.path.join(part, "config")
    os.makedirs(os.path.join(cfg_dir, "transformer"), exist_ok=True)
    cfg_file = os.path.join(cfg_dir, "transformer", "config.json")
    if not os.path.exists(cfg_file):
        with open(os.path.join(common, "transformer", "config.json"), encoding="utf-8") as f:
            base = json.load(f)
        with open(cfg_file, "w", encoding="utf-8") as f:
            json.dump(transformer_config(gguf_path, base), f, indent=2)

    tr = Flux2Transformer2DModel.from_single_file(
        gguf_path,
        config=cfg_dir,
        subfolder="transformer",
        quantization_config=GGUFQuantizationConfig(compute_dtype=t.bfloat16),
        torch_dtype=t.bfloat16,
    )
    # diffusers, GGUF içindeki BF16/F16 tensörleri (norm ölçekleri vb.) ham bayt bırakıyor: açalım
    plain = (gguf.GGMLQuantizationType.BF16, gguf.GGMLQuantizationType.F16, gguf.GGMLQuantizationType.F32)
    for mod in tr.modules():
        for pn, p in list(mod.named_parameters(recurse=False)):
            if getattr(p, "quant_type", None) in plain:
                setattr(mod, pn, t.nn.Parameter(dequantize_gguf_tensor(p).to(t.bfloat16), requires_grad=False))
    # tüm parametreler uint8 göründüğü için pipeline gizli durumları uint8'e çevirmesin
    tr.__class__ = type("IsilFlux2", (tr.__class__,), {"dtype": property(lambda s: t.bfloat16)})

    cuda = t.cuda.is_available()
    vram = t.cuda.get_device_properties(0).total_memory / 2**30 if cuda else 0
    # büyük model (9B) küçük GPU'ya sığmaz: transformer blok blok taşınır, metin kodlayıcı yalnız kodlarken GPU'da durur
    manual = cuda and os.path.getsize(gguf_path) > 4.5e9 and vram < 12
    te = Qwen3ForCausalLM.from_pretrained(os.path.join(part, "te"), dtype=t.bfloat16)
    if manual:
        te.lm_head = t.nn.Identity()  # yalnız gizli durumlar kullanılıyor; ~1 GB kazanç
    pipe = Flux2KleinPipeline.from_pretrained(common, transformer=tr, text_encoder=te, torch_dtype=t.bfloat16)
    if manual:
        te.to("cpu")
        tr.enable_group_offload(onload_device=t.device("cuda"), offload_device=t.device("cpu"), offload_type="block_level", num_blocks_per_group=1)
        pipe.vae.to("cuda")
    state.update(kind="flux", key=key, pipe=pipe, inpaint=None, owner=None, manual=manual)
    return pipe


def encode_manual(pipe, prompt):
    t = lazy_torch()
    te = pipe.text_encoder
    te.to("cuda")
    try:
        with t.no_grad():
            pe, _ = pipe.encode_prompt(prompt=prompt, device=t.device("cuda"))
    finally:
        te.to("cpu")
        t.cuda.empty_cache()
    return pe


def offload_for(p):
    """Düzenleme ve inpaint boru hatları aynı modülleri paylaşır; CPU boşaltma kancaları kullanılan boru hattına kurulur."""
    if state.get("owner") is not p and torch.cuda.is_available() and not state.get("manual"):
        p.enable_model_cpu_offload()
        state["owner"] = p
    return p


def step_cb(steps):
    def cb(pipe, i, ts, kw):
        if CANCEL.is_set():
            raise Cancelled()
        send({"id": CUR["id"], "progress": {"stage": "generate", "step": i + 1, "steps": steps}})
        return kw

    return cb


def cmd_edit(a):
    t = lazy_torch()
    from PIL import Image

    pipe = load_flux(a.get("model", "flux-fast"))
    w, h = int(a["width"]), int(a["height"])
    image = Image.open(a["image"]).convert("RGB")
    refs = [Image.open(p).convert("RGB") for p in a.get("refs") or []]
    steps = int(a.get("steps", 4))
    seed = a.get("seed")
    gen = t.Generator("cpu").manual_seed(int(seed) if seed is not None else int.from_bytes(os.urandom(4), "little"))
    send({"id": CUR["id"], "progress": {"stage": "generate", "step": 0, "steps": steps}})
    prompt = dict(prompt_embeds=encode_manual(pipe, a["prompt"])) if state.get("manual") else dict(prompt=a["prompt"])
    common = dict(
        **prompt,
        height=h,
        width=w,
        num_inference_steps=steps,
        guidance_scale=1.0,
        generator=gen,
        callback_on_step_end=step_cb(steps),
    )
    if a.get("mask"):
        from diffusers import Flux2KleinInpaintPipeline

        if state["inpaint"] is None:
            state["inpaint"] = Flux2KleinInpaintPipeline(**pipe.components)
        mask = Image.open(a["mask"]).convert("L")
        out = offload_for(state["inpaint"])(
            image=image.resize((w, h)),
            mask_image=mask.resize((w, h)),
            image_reference=refs or None,
            strength=float(a.get("strength", 1.0)),
            **common,
        ).images[0]
    else:
        out = offload_for(pipe)(image=[image] + refs, **common).images[0]
    out.save(a["out"])
    if t.cuda.is_available():
        log("vram peak GB", round(t.cuda.max_memory_allocated() / 2**30, 2), "te device", next(pipe.text_encoder.parameters()).device)
        t.cuda.reset_peak_memory_stats()
    return {"out": a["out"]}


# ---------- Qwen3-VL (stil danışmanı) ----------

def load_vlm():
    if state["kind"] == "vlm":
        return state["vlm"], state["proc"]
    unload()
    t = lazy_torch()
    from transformers import AutoProcessor, Qwen3VLForConditionalGeneration

    send({"id": CUR["id"], "progress": {"stage": "load"}})
    path = os.path.join(MODELS, "vlm")
    model = Qwen3VLForConditionalGeneration.from_pretrained(path, dtype=t.bfloat16, device_map="cuda" if t.cuda.is_available() else "cpu")
    restore_unquantized(model, path)
    proc = AutoProcessor.from_pretrained(path, max_pixels=768 * 768)
    state.update(kind="vlm", key="vlm", vlm=model, proc=proc)
    return model, proc


def restore_unquantized(model, path):
    """4-bit dosyada görsel kodlayıcı bf16 saklanır ama transformers bazı katmanlarını 4-bit katmana çeviriyor;
    o katmanları dosyadaki asıl ağırlıklarla düz Linear olarak geri koy."""
    import bitsandbytes as bnb
    from safetensors import safe_open

    t = lazy_torch()
    files = [os.path.join(path, f) for f in os.listdir(path) if f.endswith(".safetensors")]
    handles = [safe_open(f, "pt") for f in files]
    keys = {k: h for h in handles for k in h.keys()}
    n = 0
    for name, mod in list(model.named_modules()):
        if not isinstance(mod, bnb.nn.Linear4bit):
            continue
        wk = name + ".weight"
        h = keys.get(wk)
        if h is None or (wk + ".quant_state.bitsandbytes__nf4") in keys or (wk + ".absmax") in keys:
            continue  # gerçekten 4-bit saklanmış katman
        w = h.get_tensor(wk)
        lin = t.nn.Linear(w.shape[1], w.shape[0], bias=mod.bias is not None, dtype=t.bfloat16, device=mod.weight.device)
        with t.no_grad():
            lin.weight.copy_(w.to(lin.weight.device, t.bfloat16))
            if mod.bias is not None and (name + ".bias") in keys:
                lin.bias.copy_(keys[name + ".bias"].get_tensor(name + ".bias").to(lin.weight.device, t.bfloat16))
        parent, _, child = name.rpartition(".")
        setattr(model.get_submodule(parent), child, lin)
        n += 1
    log("restored unquantized linears", n)


def cmd_chat(a):
    from PIL import Image
    from transformers import StoppingCriteria, StoppingCriteriaList, TextIteratorStreamer

    model, proc = load_vlm()
    msgs = [{"role": "system", "content": [{"type": "text", "text": a.get("system", "")}]}]
    for m in a["messages"]:
        content = []
        if m.get("image"):
            content.append({"type": "image", "image": Image.open(m["image"]).convert("RGB")})
        content.append({"type": "text", "text": m["text"]})
        msgs.append({"role": m["role"], "content": content})
    inputs = proc.apply_chat_template(msgs, tokenize=True, add_generation_prompt=True, return_dict=True, return_tensors="pt").to(model.device)
    streamer = TextIteratorStreamer(proc.tokenizer, skip_prompt=True, skip_special_tokens=True)

    class Stop(StoppingCriteria):
        def __call__(self, *_a, **_k):
            return CANCEL.is_set()

    err = {}

    def run():
        try:
            model.generate(**inputs, max_new_tokens=700, do_sample=True, temperature=0.7, top_p=0.8, streamer=streamer, stopping_criteria=StoppingCriteriaList([Stop()]))
        except Exception as e:  # noqa: BLE001
            err["e"] = e
            streamer.end()

    th = threading.Thread(target=run, daemon=True)
    th.start()
    text = ""
    for piece in streamer:
        text += piece
        send({"id": CUR["id"], "progress": {"stage": "chat", "text": text}})
    th.join()
    if "e" in err:
        raise err["e"]
    if CANCEL.is_set():
        raise Cancelled()
    return {"text": text.strip()}


# ---------- ONNX modelleri (CUDA) ----------
# Kesim, kalite artırma, yüz onarma ve derinlik modelleri; tarayıcıdaki WebGPU sınırlarına takılanlar burada çalışır.
ORT = {}


def cmd_onnx(a):
    import numpy as np

    lazy_torch()  # CUDA/cuDNN DLL'leri torch ile gelir
    import onnxruntime as ort

    if state["kind"] == "vlm":
        unload()  # görsel dil modeli GPU belleğini tutuyor
    path = a["model"]
    sess = ORT.get(path)
    if sess is None:
        # 6 GB'lık kartta iki büyük oturum birlikte durursa bellek paylaşımlı RAM'e taşar: aynı anda tek oturum
        ORT.clear()
        gc.collect()
        ort.set_default_logger_severity(3)
        # sezgisel cuDNN seçimi: ilk çalıştırmadaki uzun algoritma aramasını atlar
        sess = ort.InferenceSession(path, providers=[("CUDAExecutionProvider", {"cudnn_conv_algo_search": "HEURISTIC"}), "CPUExecutionProvider"])
        ORT[path] = sess
    feeds = {k: np.fromfile(v["path"], dtype=np.float32).reshape(v["dims"]) for k, v in a["feeds"].items()}
    names = [o.name for o in sess.get_outputs()]
    first = sess.run(names[:1], feeds)[0].astype(np.float32, copy=False)
    out = a["out"]
    first.tofile(out)
    return {"outputs": {names[0]: {"path": out, "dims": list(first.shape)}}, "outputNames": names, "provider": "cuda" if "CUDA" in sess.get_providers()[0] else "cpu"}


def cmd_onnx_release(a):
    ORT.pop(a["model"], None)
    gc.collect()
    return {}


def cmd_info(_a):
    t = lazy_torch()
    cuda = t.cuda.is_available()
    return {
        "torch": t.__version__,
        "cuda": cuda,
        "device": t.cuda.get_device_name(0) if cuda else "CPU",
        "vram": round(t.cuda.get_device_properties(0).total_memory / 2**30, 1) if cuda else 0,
    }


HANDLERS = {"edit": cmd_edit, "chat": cmd_chat, "onnx": cmd_onnx, "onnx_release": cmd_onnx_release, "info": cmd_info, "unload": lambda a: unload() or {}}
CUR = {"id": None}


def main():
    send({"event": "ready"})
    while True:
        line = sys.stdin.readline()
        if not line:
            break  # stdin kapandı: main süreç gitti
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        if msg.get("cmd") not in HANDLERS:
            continue
        CUR["id"] = msg.get("id")
        CANCEL.clear()
        try:
            res = HANDLERS[msg["cmd"]](msg)
            send({"id": msg.get("id"), "ok": True, "result": res})
        except Cancelled:
            send({"id": msg.get("id"), "ok": False, "error": "cancelled"})
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            oom = torch is not None and isinstance(e, torch.cuda.OutOfMemoryError)
            if oom:
                unload()
            send({"id": msg.get("id"), "ok": False, "error": "out-of-memory" if oom else f"{type(e).__name__}: {e}"})


if __name__ == "__main__":
    main()
