import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Pencil, Check, RotateCcw, Search, ChevronUp, ChevronDown, Trash2, Plus,
  Type, Tags, LayoutGrid, Store, LayoutDashboard, ImagePlus, Image as ImageIcon,
} from "lucide-react";
import { SECCIONES, TEXTOS, TEXTOS_BASE, ETIQUETAS, variablesDe } from "./textos";
import { Modal, inputCls, inputStyle, COLORES, varsColores } from "./ui";

// ---------------------------------------------------------------------------
// Contexto del modo edición
// ---------------------------------------------------------------------------
export const EdicionCtx = createContext({
  editando: false,
  t: (k) => TEXTOS_BASE[k] ?? k,
  editarTexto: () => {},
});
export const useEdicion = () => useContext(EdicionCtx);

const detener = (e) => { e.preventDefault(); e.stopPropagation(); };

// Envuelve cualquier contenido: en modo edición se resalta y al tocarlo llama a onEditar.
export function Editable({ as: Tag = "span", onEditar, className = "", style, titulo, children }) {
  const { editando } = useEdicion();
  if (!editando || !onEditar) return <Tag className={className || undefined} style={style}>{children}</Tag>;
  const activar = (e) => { detener(e); onEditar(); };
  return (
    <Tag className={`${className} editable`} style={style} role="button" tabIndex={0} title={titulo || "Toca para editar"}
      onClick={activar} onKeyDown={(e) => { if (e.key === "Enter") activar(e); }}>
      {children}
    </Tag>
  );
}

// Texto editable del diccionario. `enBoton`: dentro de botones muestra un lápiz
// aparte para que el botón siga funcionando mientras se edita.
export function T({ k, vars, as, className, style, enBoton }) {
  const { editando, t, editarTexto } = useEdicion();
  const texto = t(k, vars);
  const estilo = typeof texto === "string" && texto.includes("\n") ? { whiteSpace: "pre-line", ...style } : style;

  if (!editando) {
    if (!texto) return null;
    if (!as && !className && !estilo) return texto;
    const Tag = as || "span";
    return <Tag className={className} style={estilo}>{texto}</Tag>;
  }

  const Tag = as || "span";
  if (enBoton) {
    return (
      <Tag className={className} style={estilo}>
        {texto || <span className="editable-vacio">(vacío)</span>}
        <span role="button" tabIndex={0} className="editable-lapiz" title={`Editar: ${ETIQUETAS[k] || k}`} aria-label={`Editar texto: ${ETIQUETAS[k] || k}`}
          onClick={(e) => { detener(e); editarTexto(k); }} onKeyDown={(e) => { if (e.key === "Enter") { detener(e); editarTexto(k); } }}>
          <Pencil size={9} />
        </span>
      </Tag>
    );
  }
  return (
    <Editable as={Tag} className={className} style={estilo} onEditar={() => editarTexto(k)} titulo={`Editar: ${ETIQUETAS[k] || k}`}>
      {texto || <span className="editable-vacio">(vacío)</span>}
    </Editable>
  );
}

// Lápiz pequeño para textos que no se ven como texto (ejemplos dentro de buscadores, etc.).
export function EditBadge({ k, className = "", etiqueta }) {
  const { editando, editarTexto } = useEdicion();
  if (!editando) return null;
  return (
    <button type="button" onClick={(e) => { detener(e); editarTexto(k); }} className={`editable-badge ${className}`}
      title={`Editar: ${ETIQUETAS[k] || k}`} aria-label={`Editar texto: ${ETIQUETAS[k] || k}`}>
      <Pencil size={10} /> {etiqueta}
    </button>
  );
}

// Botón «foto» que aparece sobre imágenes en modo edición.
export function BotonFoto({ onClick, texto = "Foto", className = "" }) {
  const { editando } = useEdicion();
  if (!editando) return null;
  return (
    <button type="button" onClick={(e) => { detener(e); onClick(); }} className={`editable-foto ${className}`} aria-label="Cambiar o recortar imagen">
      <ImagePlus size={12} /> {texto}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Hoja para editar un valor (texto, número u opciones)
// cfg: { titulo, seccion, valor, tipo: "texto"|"numero"|"opciones", opciones, multilinea,
//        variables, original, modificado, requerido, onGuardar, onRestaurar, acciones }
// ---------------------------------------------------------------------------
export function EditorCampo({ cfg, onCerrar }) {
  const [valor, setValor] = useState(cfg.valor ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const tipo = cfg.tipo || "texto";

  const ejecutar = async (fn) => {
    setGuardando(true);
    setError("");
    try {
      const r = await fn();
      if (r !== false) onCerrar();
      else setGuardando(false);
    } catch (e) {
      setError(e?.message || "No se pudo guardar. Revisa tu conexión.");
      setGuardando(false);
    }
  };

  const guardar = (v = valor) => {
    if (cfg.requerido && !String(v).trim()) { setError("Este campo no puede quedar vacío."); return; }
    if (tipo === "numero" && (v === "" || !Number.isFinite(Number(v)) || Number(v) < 0)) { setError("Escribe un número válido."); return; }
    ejecutar(() => cfg.onGuardar(tipo === "numero" ? Number(v) : v));
  };

  const boton = { background: "var(--colorBoton)", color: "var(--colorBotonTexto)" };

  return (
    <Modal onClose={guardando ? () => {} : onCerrar} title={cfg.titulo} capa={60}>
      {cfg.seccion && <p className="text-[11px] -mt-2 mb-3 uppercase tracking-wide" style={{ color: "#9A8F80" }}>{cfg.seccion}</p>}

      {tipo === "opciones" ? (
        <div className="flex flex-wrap gap-2">
          {cfg.opciones.map((o) => (
            <button key={o.valor} type="button" disabled={guardando} onClick={() => guardar(o.valor)}
              className="px-4 py-2 rounded-full text-sm border"
              style={o.valor === cfg.valor ? { background: "var(--colorBoton)", color: "var(--colorBotonTexto)", borderColor: "var(--colorBoton)" } : { background: "#fff", color: "#6B5B52", borderColor: "#E4DDD1" }}>
              {o.etiqueta}
            </button>
          ))}
        </div>
      ) : cfg.multilinea ? (
        <textarea autoFocus rows={5} value={valor} onChange={(e) => setValor(e.target.value)} className={inputCls} style={inputStyle} />
      ) : (
        <input autoFocus value={valor} onChange={(e) => setValor(e.target.value)}
          type={tipo === "numero" ? "number" : "text"} step="any" min={tipo === "numero" ? 0 : undefined}
          inputMode={tipo === "numero" ? "decimal" : undefined}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); guardar(); } }}
          className={inputCls} style={inputStyle} />
      )}

      {cfg.variables?.length > 0 && (
        <p className="text-[11px] mt-2" style={{ color: "#9A8F80" }}>
          Puedes usar {cfg.variables.join(" ")} — se reemplazan solos al mostrarse.
        </p>
      )}
      {cfg.original !== undefined && tipo !== "opciones" && cfg.original !== valor && (
        <p className="text-[11px] mt-2" style={{ color: "#B7ACA0", whiteSpace: "pre-line" }}>Original: “{cfg.original}”</p>
      )}
      {error && <p className="text-xs mt-2" style={{ color: "#B23B3B" }}>{error}</p>}

      <div className="flex flex-wrap items-center gap-2 mt-5">
        {(cfg.acciones || []).map((a) => (
          <button key={a.etiqueta} type="button" disabled={guardando} onClick={() => ejecutar(a.onClick)}
            className="text-xs px-3 py-2.5 rounded-xl flex items-center gap-1.5"
            style={a.peligro ? { background: "#FBEAEA", color: "#B23B3B" } : { background: "#EFE2DE", color: "#6B5B52" }}>
            {a.icono} {a.etiqueta}
          </button>
        ))}
        {cfg.onRestaurar && cfg.modificado && (
          <button type="button" disabled={guardando} onClick={() => ejecutar(cfg.onRestaurar)}
            className="text-xs px-3 py-2.5 rounded-xl flex items-center gap-1.5" style={{ background: "#EFE2DE", color: "#6B5B52" }}>
            <RotateCcw size={12} /> Restaurar original
          </button>
        )}
        <div className="flex-1" />
        <button type="button" disabled={guardando} onClick={onCerrar} className="text-sm px-4 py-2.5 rounded-xl border" style={{ borderColor: "#E4DDD1", color: "#6B5B52" }}>Cancelar</button>
        {tipo !== "opciones" && (
          <button type="button" disabled={guardando} onClick={() => guardar()} className="text-sm px-5 py-2.5 rounded-xl font-medium disabled:opacity-60" style={boton}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Barra del modo edición (va dentro del encabezado fijo)
// ---------------------------------------------------------------------------
export function BarraEdicion({ vista, onVista, onTextos, onCategorias, onDiseno, onListo }) {
  const chip = (activo) => (activo
    ? { background: "#fff", color: "var(--colorAcento)" }
    : { background: "rgba(255,255,255,0.16)", color: "#fff" });
  return (
    <div style={{ background: "var(--colorAcento)", color: "#fff" }}>
      <div className="max-w-5xl mx-auto px-4 pt-2 flex items-center gap-2">
        <Pencil size={14} className="flex-shrink-0" />
        <p className="text-xs font-semibold flex-1 min-w-0 leading-tight">
          Modo edición <span className="font-normal opacity-90">· toca un texto o imagen para cambiarlo</span>
        </p>
        <button type="button" onClick={onListo} className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0" style={{ background: "#fff", color: "var(--colorAcento)" }}>
          <Check size={13} /> Listo
        </button>
      </div>
      <div className="max-w-5xl mx-auto px-4 py-2 flex gap-1.5 overflow-x-auto scrollbar-none">
        <button type="button" onClick={() => onVista("cliente")} className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-full" style={chip(vista === "cliente")}><Store size={12} /> Tienda</button>
        <button type="button" onClick={() => onVista("admin")} className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-full" style={chip(vista === "admin")}><LayoutDashboard size={12} /> Administración</button>
        <span className="flex-shrink-0 w-px my-1" style={{ background: "rgba(255,255,255,0.35)" }} />
        <button type="button" onClick={onTextos} className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-full" style={chip(false)}><Type size={12} /> Todos los textos</button>
        <button type="button" onClick={onCategorias} className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-full" style={chip(false)}><Tags size={12} /> Categorías</button>
        <button type="button" onClick={onDiseno} className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-full" style={chip(false)}><LayoutGrid size={12} /> Diseño e imágenes</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel con TODOS los textos del sitio
// ---------------------------------------------------------------------------
export function TextosPanel({ valorCrudo, esModificado, onGuardar, onRestaurar, onCerrar }) {
  const [q, setQ] = useState("");
  const [abiertas, setAbiertas] = useState({});
  const termino = q.trim().toLowerCase();

  const grupos = useMemo(() => SECCIONES.map(([id, nombre]) => {
    const items = TEXTOS.filter(([k]) => k.split(".")[0] === id).filter(([k, etiqueta, original]) => {
      if (!termino) return true;
      return [etiqueta, original, valorCrudo(k)].join(" ").toLowerCase().includes(termino);
    });
    return { id, nombre, items, modificados: items.filter(([k]) => esModificado(k)).length };
  }).filter((g) => g.items.length > 0), [termino, valorCrudo, esModificado]);

  return (
    <Modal onClose={onCerrar} title="Todos los textos" muyAncho>
      <p className="text-xs mb-3" style={{ color: "#9A8F80" }}>
        Cambia cualquier texto del sitio, incluso los que no se ven a simple vista (mensajes, ejemplos de búsqueda y el mensaje de WhatsApp).
      </p>
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" color="#B7ACA0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar texto…" className="w-full rounded-full border pl-10 pr-4 py-2.5 text-sm outline-none" style={inputStyle} />
      </div>
      <div className="space-y-2">
        {grupos.map((g) => {
          const abierta = Boolean(termino) || abiertas[g.id];
          return (
            <div key={g.id} className="rounded-2xl border" style={{ borderColor: "#E9E1D4", background: "#fff" }}>
              <button type="button" onClick={() => setAbiertas((a) => ({ ...a, [g.id]: !a[g.id] }))} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
                <span className="text-sm font-medium">{g.nombre}</span>
                <span className="flex items-center gap-2 text-[11px]" style={{ color: "#9A8F80" }}>
                  {g.modificados > 0 && <span className="px-2 py-0.5 rounded-full" style={{ background: "#F6E4E4", color: "var(--colorAcento)" }}>{g.modificados} cambiado{g.modificados !== 1 ? "s" : ""}</span>}
                  {g.items.length}
                  {abierta ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>
              {abierta && (
                <div className="px-3 pb-3 space-y-2">
                  {g.items.map(([k, etiqueta, original]) => (
                    <FilaTexto key={k} k={k} etiqueta={etiqueta} original={original} actual={valorCrudo(k)} modificado={esModificado(k)}
                      onGuardar={(v) => onGuardar(k, v)} onRestaurar={() => onRestaurar(k)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {grupos.length === 0 && <p className="text-sm py-6 text-center" style={{ color: "#B7ACA0" }}>Ningún texto coincide.</p>}
      </div>
    </Modal>
  );
}

function FilaTexto({ k, etiqueta, original, actual, modificado, onGuardar, onRestaurar }) {
  const [v, setV] = useState(actual);
  const [estado, setEstado] = useState("");
  useEffect(() => { setV(actual); }, [actual]);
  const sucio = v !== actual;
  const largo = (original || "").length > 48 || /\n/.test(original || "");
  const vars = variablesDe(k);

  const guardar = async () => {
    setEstado("guardando");
    try { await onGuardar(v); setEstado("ok"); setTimeout(() => setEstado(""), 1500); }
    catch { setEstado("error"); }
  };

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: modificado ? "#E9C9CF" : "#F1EBE0", background: "#FDFBF8" }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-xs font-medium" style={{ color: "#6B5B52" }}>{etiqueta}</p>
        {modificado && <span className="text-[10px] flex-shrink-0" style={{ color: "var(--colorAcento)" }}>Modificado</span>}
      </div>
      {largo
        ? <textarea rows={3} value={v} onChange={(e) => setV(e.target.value)} className={inputCls} style={inputStyle} />
        : <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && sucio) guardar(); }} className={inputCls} style={inputStyle} />}
      {vars.length > 0 && <p className="text-[10px] mt-1" style={{ color: "#B7ACA0" }}>Variables: {vars.join(" ")}</p>}
      {(sucio || modificado || estado) && (
        <div className="flex flex-wrap items-center justify-end gap-2 mt-2">
          {estado === "ok" && <span className="text-[11px]" style={{ color: "#2F8542" }}>Guardado</span>}
          {estado === "error" && <span className="text-[11px]" style={{ color: "#B23B3B" }}>No se pudo guardar</span>}
          {modificado && !sucio && (
            <button type="button" onClick={onRestaurar} className="text-[11px] px-3 py-1.5 rounded-full flex items-center gap-1" style={{ background: "#EFE2DE", color: "#6B5B52" }}>
              <RotateCcw size={11} /> Restaurar original
            </button>
          )}
          {sucio && (
            <>
              <button type="button" onClick={() => setV(actual)} className="text-[11px] px-3 py-1.5 rounded-full" style={{ background: "#F7F3EC", color: "#6B5B52" }}>Descartar</button>
              <button type="button" onClick={guardar} disabled={estado === "guardando"} className="text-[11px] px-3 py-1.5 rounded-full font-medium" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>
                {estado === "guardando" ? "Guardando…" : "Guardar"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel de categorías: agregar, renombrar, ordenar y eliminar
// ---------------------------------------------------------------------------
export function CategoriasPanel({ categorias, conteo, t, onAgregar, onRenombrar, onEliminar, onMover, onCerrar }) {
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState("");
  const [enEdicion, setEnEdicion] = useState(null);
  const [valor, setValor] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const correr = async (fn) => {
    setOcupado(true); setError("");
    try { await fn(); } catch (e) { setError(e?.message || t("general.errorGuardar")); }
    setOcupado(false);
  };

  const agregar = () => {
    const nombre = nueva.trim();
    if (!nombre) return;
    correr(async () => { await onAgregar(nombre); setNueva(""); });
  };

  const renombrar = (anterior) => {
    const nombre = valor.trim();
    if (!nombre || nombre === anterior) { setEnEdicion(null); return; }
    correr(async () => { await onRenombrar(anterior, nombre); setEnEdicion(null); });
  };

  const eliminar = (nombre) => {
    const n = conteo[nombre] || 0;
    if (!window.confirm(t("cat.confirmarEliminar", { nombre, n }))) return;
    correr(() => onEliminar(nombre));
  };

  return (
    <Modal onClose={onCerrar} title={t("cat.titulo")}>
      <p className="text-xs mb-4" style={{ color: "#9A8F80" }}>{t("cat.texto")}</p>

      <div className="flex gap-2 mb-4">
        <input value={nueva} onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") agregar(); }}
          placeholder={t("cat.nuevaPh")} className={inputCls + " mt-0"} style={inputStyle} />
        <button type="button" onClick={agregar} disabled={ocupado || !nueva.trim()} className="px-4 rounded-xl text-sm font-medium flex items-center gap-1 flex-shrink-0 disabled:opacity-50" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>
          <Plus size={14} /> {t("cat.agregar")}
        </button>
      </div>
      {error && <p className="text-xs mb-3" style={{ color: "#B23B3B" }}>{error}</p>}

      {categorias.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: "#B7ACA0" }}>{t("cat.vacio")}</p>
      ) : (
        <div className="space-y-2">
          {categorias.map((c, i) => (
            <div key={c} className="rounded-xl border px-3 py-2.5 flex items-center gap-2" style={{ borderColor: "#E9E1D4", background: "#fff" }}>
              <div className="flex flex-col">
                <button type="button" disabled={ocupado || i === 0} onClick={() => correr(() => onMover(c, -1))} className="disabled:opacity-25" aria-label="Subir"><ChevronUp size={15} color="#6B5B52" /></button>
                <button type="button" disabled={ocupado || i === categorias.length - 1} onClick={() => correr(() => onMover(c, 1))} className="disabled:opacity-25" aria-label="Bajar"><ChevronDown size={15} color="#6B5B52" /></button>
              </div>
              {enEdicion === c ? (
                <input autoFocus value={valor} onChange={(e) => setValor(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") renombrar(c); if (e.key === "Escape") setEnEdicion(null); }}
                  className="flex-1 min-w-0 rounded-lg border px-2 py-1.5 text-sm outline-none" style={inputStyle} />
              ) : (
                <button type="button" onClick={() => { setEnEdicion(c); setValor(c); }} className="flex-1 min-w-0 text-left">
                  <span className="text-sm font-medium block truncate">{c}</span>
                  <span className="text-[11px]" style={{ color: "#9A8F80" }}>{t("cat.productos", { n: conteo[c] || 0 })}</span>
                </button>
              )}
              {enEdicion === c ? (
                <button type="button" onClick={() => renombrar(c)} disabled={ocupado} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#2B2320" }} aria-label="Guardar nombre"><Check size={14} color="#F7F3EC" /></button>
              ) : (
                <button type="button" onClick={() => { setEnEdicion(c); setValor(c); }} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#EFE2DE" }} aria-label="Renombrar"><Pencil size={13} color="#6B5B52" /></button>
              )}
              <button type="button" onClick={() => eliminar(c)} disabled={ocupado} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#FBEAEA" }} aria-label="Eliminar"><Trash2 size={13} color="#B23B3B" /></button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Panel de diseño: formato de fotos, tamaño de tarjetas, logo y portada
// ---------------------------------------------------------------------------
export const FORMATOS_FOTO = ["3:4", "4:5", "1:1", "2:3", "4:3"];
export const TAMANOS_TARJETA = [["chico", "Chico"], ["normal", "Normal"], ["grande", "Grande"]];

export function TamanoLogo({ valor, onCambiar }) {
  const [v, setV] = useState(valor);
  const timer = useRef(null);
  useEffect(() => { setV(valor); }, [valor]);
  const cambiar = (n) => {
    setV(n);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onCambiar(n), 350);
  };
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: "#9A8F80" }}>Tamaño del logo en pantalla · {v}px</p>
      <input type="range" min={32} max={96} step={2} value={v} onChange={(e) => cambiar(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--colorAcento)" }} aria-label="Tamaño del logo" />
    </div>
  );
}

export function DisenoPanel({ settings, imagenes, logoPorDefecto, onAjuste, onEditarLogo, onQuitarLogo, onEditarPortada, onQuitarPortada, onCerrar }) {
  const chip = (activo) => (activo
    ? { background: "var(--colorBoton)", color: "var(--colorBotonTexto)", borderColor: "var(--colorBoton)" }
    : { background: "#fff", color: "#6B5B52", borderColor: "#E4DDD1" });
  const seccion = "rounded-2xl border p-4 space-y-3";
  const caja = { borderColor: "#E9E1D4", background: "#fff" };
  const titulo = "text-xs font-semibold tracking-widest uppercase";

  return (
    <Modal onClose={onCerrar} title="Diseño e imágenes" wide>
      <div className="space-y-3">
        <div className={seccion} style={caja}>
          <p className={titulo} style={{ color: "#6B5B52" }}>Colores</p>
          <div className="grid grid-cols-2 gap-2">
            {COLORES.map(([k, txt, def]) => {
              const val = varsColores(settings)["--" + k];
              return (
                <label key={k} className="flex items-center gap-2 rounded-xl border p-2 text-[11px]" style={{ borderColor: "#E4DDD1", color: "#6B5B52" }}>
                  <input type="color" value={val} onChange={(e) => onAjuste(k, e.target.value)} className="w-9 h-9 rounded-lg border-0 p-0 bg-transparent flex-shrink-0 cursor-pointer" aria-label={txt} />
                  <span className="min-w-0 leading-tight">{txt}{val.toLowerCase() !== def.toLowerCase() && (
                    <button type="button" onClick={(e) => { e.preventDefault(); onAjuste(k, def); }} className="block underline mt-0.5" style={{ color: "#9A8F80" }}>Restaurar</button>
                  )}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className={seccion} style={caja}>
          <p className={titulo} style={{ color: "#6B5B52" }}>Fotos de productos</p>
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: "#9A8F80" }}>Formato del recuadro</p>
            <div className="flex flex-wrap gap-1.5">
              {FORMATOS_FOTO.map((f) => (
                <button key={f} type="button" onClick={() => onAjuste("fotoAspecto", f)} className="text-xs px-3 py-1.5 rounded-full border" style={chip(settings.fotoAspecto === f)}>{f}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: "#9A8F80" }}>Tamaño de las tarjetas</p>
            <div className="flex flex-wrap gap-1.5">
              {TAMANOS_TARJETA.map(([v, txt]) => (
                <button key={v} type="button" onClick={() => onAjuste("tarjetaTam", v)} className="text-xs px-3 py-1.5 rounded-full border" style={chip(settings.tarjetaTam === v)}>{txt}</button>
              ))}
            </div>
          </div>
          <p className="text-[11px]" style={{ color: "#9A8F80" }}>Para recortar la foto de un producto, toca «Foto» sobre su tarjeta.</p>
        </div>

        <div className={seccion} style={caja}>
          <p className={titulo} style={{ color: "#6B5B52" }}>Logo</p>
          <div className="flex items-center gap-3">
            <div className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ width: 56, height: 56, background: "#EFE2DE" }}>
              {imagenes.logo ? <img src={imagenes.logo} alt="" className="w-full h-full object-cover" /> : logoPorDefecto}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onEditarLogo} className="text-xs px-3 py-2 rounded-xl flex items-center gap-1.5" style={{ background: "#EFE2DE", color: "#6B5B52" }}><ImageIcon size={13} /> {imagenes.logo ? "Cambiar / recortar" : "Subir logo"}</button>
              {imagenes.logo && <button type="button" onClick={onQuitarLogo} className="text-xs px-3 py-2 rounded-xl" style={{ background: "#F7F3EC", color: "#6B5B52" }}>Usar mariposa original</button>}
            </div>
          </div>
          <TamanoLogo valor={settings.logoTam} onCambiar={(n) => onAjuste("logoTam", n)} />
        </div>

        <div className={seccion} style={caja}>
          <p className={titulo} style={{ color: "#6B5B52" }}>Imagen de portada</p>
          {imagenes.portada
            ? <img src={imagenes.portada} alt="" className="w-full rounded-xl" />
            : <p className="text-[11px]" style={{ color: "#9A8F80" }}>Opcional: una imagen grande arriba del catálogo. Si no agregas una, no se muestra nada.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onEditarPortada} className="text-xs px-3 py-2 rounded-xl flex items-center gap-1.5" style={{ background: "#EFE2DE", color: "#6B5B52" }}>
              <ImagePlus size={13} /> {imagenes.portada ? "Cambiar / recortar" : "Agregar portada"}
            </button>
            {imagenes.portada && <button type="button" onClick={onQuitarPortada} className="text-xs px-3 py-2 rounded-xl" style={{ background: "#FBEAEA", color: "#B23B3B" }}>Quitar portada</button>}
          </div>
        </div>
      </div>
      <button type="button" onClick={onCerrar} className="w-full mt-4 rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>
        <Check size={14} /> Listo
      </button>
    </Modal>
  );
}
