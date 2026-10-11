import React, { useState, useEffect, useRef } from "react";
import Cropper from "react-easy-crop";
import { X, RotateCcw, RotateCw, ImagePlus, Trash2, Maximize2, ZoomIn, ZoomOut, Crosshair } from "lucide-react";

// ---------------------------------------------------------------------------
// Editor de imágenes: cambiar, recortar, girar, acercar/alejar y elegir tamaño.
// Las imágenes se guardan comprimidas (data URL) en Firestore, igual que antes.
// ---------------------------------------------------------------------------

export const ASPECTOS = { "3:4": 3 / 4, "4:5": 4 / 5, "1:1": 1, "2:3": 2 / 3, "4:3": 4 / 3, "16:9": 16 / 9, "3:1": 3 };

export const TAMANOS_PRODUCTO = [
  { etiqueta: "Ligera", lado: 640 },
  { etiqueta: "Normal", lado: 900 },
  { etiqueta: "Alta", lado: 1280 },
];

// Firestore admite documentos de hasta 1 MB; dejamos margen.
const LIMITE_DOC = 900000;

function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function leerComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function aDataUrl(canvas, png, calidad) {
  return png ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", calidad);
}

// Reduce una imagen (data URL o URL del mismo sitio) hasta que quepa en Firestore.
export async function comprimir(src, { maxLado = 1400, png = false, calidad = 0.82, fondo = "#FFFFFF" } = {}) {
  const img = await cargarImagen(src);
  let lado = maxLado;
  let q = calidad;
  for (let intento = 0; intento < 5; intento++) {
    const esc = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * esc));
    c.height = Math.max(1, Math.round(img.naturalHeight * esc));
    const ctx = c.getContext("2d");
    if (!png) { ctx.fillStyle = fondo; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const out = aDataUrl(c, png, q);
    if (out.length <= LIMITE_DOC || intento === 4) return out;
    lado = Math.round(lado * 0.8);
    q = Math.max(0.6, q - 0.08);
  }
  return null;
}

// Archivo del dispositivo → data URL reducida (respeta la orientación de la foto).
export async function leerArchivo(file, { maxLado = 1400, png = false } = {}) {
  const url = await leerComoDataUrl(file);
  return comprimir(url, { maxLado, png });
}

// Recorta según el área de react-easy-crop (en píxeles de la imagen girada).
// Si la imagen se alejó (zoom < 1), el espacio vacío se rellena con `fondo`.
export async function recortar(src, area, rotacion = 0, { lado = 900, png = false, fondo = "#FFFFFF", calidad = 0.82 } = {}) {
  const img = await cargarImagen(src);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  let fuente = img;
  let fw = W;
  let fh = H;
  if (rotacion % 360 !== 0) {
    const rad = (rotacion * Math.PI) / 180;
    const c = document.createElement("canvas");
    c.width = Math.round(Math.abs(Math.cos(rad)) * W + Math.abs(Math.sin(rad)) * H);
    c.height = Math.round(Math.abs(Math.sin(rad)) * W + Math.abs(Math.cos(rad)) * H);
    const ctx = c.getContext("2d");
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -W / 2, -H / 2);
    fuente = c; fw = c.width; fh = c.height;
  }

  let maxLado = lado;
  let q = calidad;
  for (let intento = 0; intento < 5; intento++) {
    const esc = Math.min(1, maxLado / Math.max(area.width, area.height));
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(area.width * esc));
    out.height = Math.max(1, Math.round(area.height * esc));
    const octx = out.getContext("2d");
    if (!png) { octx.fillStyle = fondo; octx.fillRect(0, 0, out.width, out.height); }
    octx.imageSmoothingQuality = "high";
    // Intersección del área con la imagen (evita dibujar fuera de los bordes).
    const sx = Math.max(0, area.x);
    const sy = Math.max(0, area.y);
    const ex = Math.min(fw, area.x + area.width);
    const ey = Math.min(fh, area.y + area.height);
    if (ex > sx && ey > sy) {
      octx.drawImage(fuente, sx, sy, ex - sx, ey - sy, (sx - area.x) * esc, (sy - area.y) * esc, (ex - sx) * esc, (ey - sy) * esc);
    }
    const data = aDataUrl(out, png, q);
    if (data.length <= LIMITE_DOC || intento === 4) return data;
    maxLado = Math.round(maxLado * 0.8);
    q = Math.max(0.6, q - 0.08);
  }
  return null;
}

// URL (mismo sitio) → data URL, sin recomprimir.
export async function urlADataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url}`);
  const blob = await res.blob();
  return leerComoDataUrl(blob);
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
export default function ImageEditor({
  titulo = "Editar imagen",
  src: srcInicial = null,
  cargarOriginal,
  recorteInicial = null,
  aspecto = "1:1",
  opcionesAspecto = null,
  redondo = false,
  tamanos = TAMANOS_PRODUCTO,
  tamanoInicial = 1,
  png = false,
  ayuda,
  extra,
  onGuardar,
  onCancelar,
  onQuitar,
}) {
  const [src, setSrc] = useState(srcInicial);
  const [nuevoOriginal, setNuevoOriginal] = useState(null);
  // true cuando se edita sobre la foto original completa (no sobre un recorte previo).
  const [esOriginal, setEsOriginal] = useState(false);
  // Recorte guardado la última vez: se muestra al abrir para continuar desde ahí.
  const [usarRecorte, setUsarRecorte] = useState(Boolean(recorteInicial));
  const [cargando, setCargando] = useState(Boolean(cargarOriginal));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotacion, setRotacion] = useState(0);
  const [aspSel, setAspSel] = useState(aspecto);
  const [natural, setNatural] = useState(null);
  const [mediaSize, setMediaSize] = useState(null);
  const [cropSize, setCropSize] = useState(null);
  const [area, setArea] = useState(null);
  const [tam, setTam] = useState(Math.min(tamanoInicial, tamanos.length - 1));
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  // Si existe la foto original (sin recortar), se edita sobre ella.
  useEffect(() => {
    let vivo = true;
    if (cargarOriginal) {
      cargarOriginal()
        .then((o) => {
          if (!vivo) return;
          if (o) {
            setSrc(o);
            setEsOriginal(true);
            if (recorteInicial?.rotacion) setRotacion(recorteInicial.rotacion);
          } else {
            setUsarRecorte(false);
          }
        })
        .catch(() => { if (vivo) setUsarRecorte(false); })
        .finally(() => { if (vivo) setCargando(false); });
    } else {
      setUsarRecorte(false);
    }
    return () => { vivo = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const girado = rotacion % 180 !== 0;
  const aspectoNum = aspSel === "original"
    ? (natural ? (girado ? natural.h / natural.w : natural.w / natural.h) : 1)
    : (ASPECTOS[aspSel] || 1);

  const reiniciar = () => { setUsarRecorte(false); setCrop({ x: 0, y: 0 }); setZoom(1); };

  const elegirArchivo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setCargando(true);
    try {
      const data = await leerArchivo(file, { maxLado: 1400, png: png && file.type === "image/png" });
      setSrc(data);
      setNuevoOriginal(data);
      setEsOriginal(true);
      setRotacion(0);
      reiniciar();
    } catch {
      setError("No se pudo abrir esa imagen. Prueba con otra.");
    }
    setCargando(false);
  };

  // Aleja la imagen para que se vea completa dentro del marco.
  const verCompleta = () => {
    if (!cropSize || !mediaSize) return;
    const mw = girado ? mediaSize.height : mediaSize.width;
    const mh = girado ? mediaSize.width : mediaSize.height;
    const z = Math.min(cropSize.width / mw, cropSize.height / mh);
    setZoom(Math.max(0.3, Math.min(1, z)));
    setCrop({ x: 0, y: 0 });
  };

  const girar = (grados) => { setUsarRecorte(false); setRotacion((r) => (r + grados + 360) % 360); };

  const aplicar = async () => {
    if (!src || !area) return;
    setProcesando(true);
    setError("");
    try {
      // PNG solo si la imagen ya era PNG (logos con fondo transparente); lo demás va en JPEG ligero.
      const salidaPng = png && typeof src === "string" && src.startsWith("data:image/png");
      const imagen = await recortar(src, area, rotacion, { lado: tamanos[tam]?.lado || 900, png: salidaPng });
      const recorte = esOriginal
        ? { x: Math.round(area.x), y: Math.round(area.y), width: Math.round(area.width), height: Math.round(area.height), rotacion }
        : null;
      await onGuardar({ imagen, original: nuevoOriginal, recorte });
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar la imagen. Revisa tu conexión e intenta de nuevo.");
      setProcesando(false);
    }
  };

  const chip = (activo) => (activo
    ? { background: "#17152B", color: "#F6F5FA", borderColor: "#17152B" }
    : { background: "#fff", color: "#4A4760", borderColor: "#E3E0EC" });

  return (
    <div className="fixed inset-0 flex items-end md:items-center justify-center" style={{ zIndex: 70 }}>
      <div className="absolute inset-0" style={{ background: "rgba(23,21,43,0.55)" }} onClick={procesando ? undefined : onCancelar} />
      <div className="relative w-full md:max-w-2xl h-[100dvh] md:h-auto md:max-h-[92vh] flex flex-col md:rounded-3xl overflow-hidden" style={{ background: "#F6F5FA" }}>
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 className="font-display text-2xl min-w-0 truncate">{titulo}</h2>
          <button type="button" onClick={onCancelar} disabled={procesando} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#ECE8F6" }} aria-label="Cerrar">
            <X size={15} color="#4A4760" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3">
          <div className="relative w-full h-[46vh] md:h-[380px] rounded-2xl overflow-hidden" style={{ background: "#17152B" }}>
            {cargando ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: "#E3E0EC" }}>Cargando imagen…</div>
            ) : !src ? (
              <button type="button" onClick={() => fileRef.current?.click()} className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm" style={{ color: "#F6F5FA" }}>
                <ImagePlus size={28} />
                Elegir foto
              </button>
            ) : (
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                rotation={rotacion}
                aspect={aspectoNum}
                minZoom={0.3}
                maxZoom={5}
                zoomSpeed={0.15}
                restrictPosition={false}
                initialCroppedAreaPixels={usarRecorte && esOriginal && recorteInicial ? recorteInicial : undefined}
                cropShape={redondo ? "round" : "rect"}
                showGrid={!redondo}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotacion}
                onCropComplete={(_, px) => setArea(px)}
                onCropSizeChange={setCropSize}
                onMediaLoaded={(m) => { setMediaSize(m); setNatural({ w: m.naturalWidth, h: m.naturalHeight }); }}
                style={{ containerStyle: { background: "#17152B" } }}
              />
            )}
          </div>

          {src && !cargando && (
            <div className="space-y-3 pt-4">
              <div className="flex items-center gap-3">
                <ZoomOut size={16} color="#4A4760" />
                <input type="range" min={0.3} max={5} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1" style={{ accentColor: "#B25C6B" }} aria-label="Acercar o alejar" />
                <ZoomIn size={16} color="#4A4760" />
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => girar(-90)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border" style={chip(false)}><RotateCcw size={13} /> Girar</button>
                <button type="button" onClick={() => girar(90)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border" style={chip(false)}><RotateCw size={13} /> Girar</button>
                <button type="button" onClick={verCompleta} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border" style={chip(false)}><Maximize2 size={13} /> Ver completa</button>
                <button type="button" onClick={reiniciar} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border" style={chip(false)}><Crosshair size={13} /> Centrar</button>
              </div>

              {opcionesAspecto && opcionesAspecto.length > 1 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: "#8C89A0" }}>Formato del recorte</p>
                  <div className="flex flex-wrap gap-1.5">
                    {opcionesAspecto.map((a) => (
                      <button key={a} type="button" onClick={() => { setAspSel(a); reiniciar(); }} className="text-xs px-3 py-1.5 rounded-full border" style={chip(aspSel === a)}>
                        {a === "original" ? "Original" : a}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {tamanos.length > 1 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: "#8C89A0" }}>Tamaño del archivo</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tamanos.map((t, i) => (
                      <button key={t.etiqueta} type="button" onClick={() => setTam(i)} className="text-xs px-3 py-1.5 rounded-full border" style={chip(tam === i)}>
                        {t.etiqueta} · {t.lado} px
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {extra}
              {ayuda && <p className="text-[11px]" style={{ color: "#8C89A0" }}>{ayuda}</p>}
            </div>
          )}

          {error && <p className="text-xs mt-3" style={{ color: "#B23B3B" }}>{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-t" style={{ borderColor: "#E6E3EE" }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={elegirArchivo} className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={procesando}
            className="flex items-center gap-1.5 text-xs px-3 py-2.5 rounded-xl" style={{ background: "#ECE8F6", color: "#4A4760" }}>
            <ImagePlus size={14} /> {src ? "Cambiar foto" : "Elegir foto"}
          </button>
          {onQuitar && (
            <button type="button" onClick={onQuitar} disabled={procesando}
              className="flex items-center gap-1.5 text-xs px-3 py-2.5 rounded-xl" style={{ background: "#FBEAEA", color: "#B23B3B" }}>
              <Trash2 size={14} /> Quitar
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onCancelar} disabled={procesando} className="text-sm px-4 py-2.5 rounded-xl border" style={{ borderColor: "#E3E0EC", color: "#4A4760" }}>Cancelar</button>
          <button type="button" onClick={aplicar} disabled={!src || !area || procesando || cargando}
            className="text-sm px-5 py-2.5 rounded-xl font-medium disabled:opacity-50" style={{ background: "#17152B", color: "#F6F5FA" }}>
            {procesando ? "Guardando…" : "Aplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
