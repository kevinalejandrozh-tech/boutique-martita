// ---------------------------------------------------------------------------
// Compra del cliente: cantidad, sugerencia, carrito en el encabezado y pedido
// con método de pago y entrega.
// ---------------------------------------------------------------------------
import React, { useMemo, useState } from "react";
import {
  Minus, Plus, Trash2, ShoppingCart, Check, Copy, AlertTriangle, MapPin, Landmark, Banknote,
  CreditCard, Send, ImageOff, Pencil, Truck, Search,
} from "lucide-react";
import { Modal, inputCls, inputStyle } from "./ui";
import { T, useEdicion } from "./edicion";
import { money, totalesPedido, MARCA, NUMERO_TRANSFERENCIA, numeroAgrupado, normalizar, soloDigitos } from "./negocio";

const VERDE = "#2F8542";

// Ícono de carrito con «+» para el botón circular de cada producto.
export function IconoCarritoMas({ size = 18 }) {
  return (
    <span className="relative inline-flex">
      <ShoppingCart size={size} />
      <span className="absolute rounded-full flex items-center justify-center"
        style={{ top: -6, right: -8, width: 14, height: 14, background: VERDE, color: "#fff", boxShadow: "0 0 0 1.5px #fff" }}>
        <Plus size={9} strokeWidth={3.5} />
      </span>
    </span>
  );
}

// Contador − / número / +. El número también se puede escribir a mano.
function Contador({ valor, min = 1, max, onCambiar, grande }) {
  const [texto, setTexto] = useState(null); // null = muestra `valor`
  const tam = grande ? "w-11 h-11 text-lg" : "w-8 h-8 text-sm";
  const fijar = (n) => onCambiar(Math.max(min, Math.min(max, n)));
  const confirmar = () => {
    if (texto !== null) {
      const n = parseInt(texto, 10);
      fijar(Number.isFinite(n) ? n : valor);
    }
    setTexto(null);
  };
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => fijar(valor - 1)} disabled={valor <= min}
        className={`${tam} rounded-full border flex items-center justify-center disabled:opacity-35`} style={{ borderColor: "#E3E0EC", background: "#fff" }} aria-label="Menos">
        <Minus size={grande ? 16 : 13} />
      </button>
      <input type="number" inputMode="numeric" min={min} max={max} step="1" aria-label="Número de piezas"
        value={texto !== null ? texto : valor}
        onFocus={(e) => { setTexto(String(valor)); e.target.select(); }}
        onChange={(e) => setTexto(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={confirmar}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        className={`${grande ? "w-16 h-11 text-2xl font-display" : "w-10 h-8 text-sm font-medium"} text-center rounded-xl border border-transparent hover:border-[#E3E0EC] focus:border-[#B9A7DD] outline-none bg-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`} />
      <button type="button" onClick={() => fijar(valor + 1)} disabled={valor >= max}
        className={`${tam} rounded-full border flex items-center justify-center disabled:opacity-35`} style={{ borderColor: "#E3E0EC", background: "#fff" }} aria-label="Más">
        <Plus size={grande ? 16 : 13} />
      </button>
    </div>
  );
}

function FichaProducto({ p }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: "#EEEDF3" }}>
        {p.imagen ? <img src={p.imagen} alt="" className="w-full h-full object-cover" /> : <ImageOff size={18} color="#BDBACC" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{p.nombre}</p>
        <p className="font-display text-lg leading-tight mt-0.5">{money(p.precioVenta)}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1) ¿Cuántas piezas?
// ---------------------------------------------------------------------------
export function CantidadModal({ p, maximo, onConfirmar, onCerrar }) {
  const { t } = useEdicion();
  const [qty, setQty] = useState(1);
  return (
    <Modal onClose={onCerrar} title={<T k="compra.cuantasTitulo" />}>
      <FichaProducto p={p} />
      {maximo > 0 ? (
        <>
          <div className="flex items-center justify-between mt-5">
            <Contador valor={qty} max={maximo} onCambiar={setQty} grande />
            <div className="text-right">
              <p className="text-[11px]" style={{ color: "#8C89A0" }}>{t("compra.disponibles", { n: maximo })}</p>
              <p className="font-display text-xl">{money((Number(p.precioVenta) || 0) * qty)}</p>
            </div>
          </div>
          <T k="compra.escribir" as="p" className="text-[11px] mt-1.5 block" style={{ color: "#A9A6BA" }} />
          <button type="button" onClick={() => onConfirmar(qty)} className="w-full mt-4 rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-medium" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>
            <ShoppingCart size={15} /> {t("compra.agregar")}
          </button>
        </>
      ) : (
        <p className="text-sm mt-4 rounded-xl px-3 py-2.5" style={{ background: "#FBEAEA", color: "#9C3B3B" }}>{t("tarjeta.limite", { n: p.cantidad })}</p>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// 2) Sugerencia de otro producto (solo «Sí» o «Seguir viendo el catálogo»)
// ---------------------------------------------------------------------------
export function SugerenciaModal({ p, maximo, onSi, onNo }) {
  const { t } = useEdicion();
  const [qty, setQty] = useState(Math.min(5, maximo));
  return (
    <Modal onClose={onNo} title={<T k="compra.sugerenciaTitulo" />}>
      <FichaProducto p={p} />
      <T k="compra.sugerenciaTexto" as="p" className="text-sm mt-3 block" style={{ color: "#4A4760" }} />
      <div className="flex items-center justify-between mt-4">
        <Contador valor={qty} max={maximo} onCambiar={setQty} />
        <span className="font-display text-xl">{money((Number(p.precioVenta) || 0) * qty)}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-5">
        <button type="button" onClick={onNo} className="rounded-xl py-3 text-sm font-medium border" style={{ borderColor: "#E3E0EC", color: "#4A4760", background: "#fff" }}>{t("compra.seguir")}</button>
        <button type="button" onClick={() => onSi(qty)} className="rounded-xl py-3 text-sm font-semibold" style={{ background: VERDE, color: "#fff" }}>{t("compra.si")}</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// 3) Carrito resaltado en verde dentro del encabezado
// ---------------------------------------------------------------------------
export function BarraCarrito({ articulos, total, onEnviar }) {
  const { t } = useEdicion();
  return (
    <div style={{ background: VERDE, color: "#fff" }}>
      <button type="button" onClick={onEnviar} className="w-full max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-2 text-sm font-medium min-w-0">
          <ShoppingCart size={17} className="flex-shrink-0" />
          <span className="truncate">{articulos} · <strong>{money(total)}</strong></span>
        </span>
        <span className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold flex-shrink-0" style={{ background: "#fff", color: VERDE }}>
          <Send size={12} /> {t("compra.enviarAhora")}
        </span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4) Pedido: nombre y teléfono → resumen, pago y entrega → enviado
// ---------------------------------------------------------------------------
const METODOS = [
  ["transferencia", "compra.transferencia", Landmark],
  ["efectivo", "compra.efectivo", Banknote],
  ["tarjeta", "compra.tarjeta", CreditCard],
];

export function Checkout({ cart, stockDe, colonias, compra, setCompra, onQty, onQuitar, onEnviar, onCerrar, onTerminar }) {
  const { t } = useEdicion();
  const datosOk = (compra.nombre || "").trim() && soloDigitos(compra.telefono).length >= 10;
  const [paso, setPaso] = useState(datosOk ? "resumen" : "datos");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [folio, setFolio] = useState(null);
  const set = (k, v) => setCompra((c) => ({ ...c, [k]: v }));

  const colonia = colonias.find((c) => c.id === compra.coloniaId) || null;
  const items = cart.map((i) => ({ id: i.id, nombre: i.nombre, detalle: i.detalle || "", precio: Number(i.precioVenta) || 0, qty: i.qty }));
  const tot = totalesPedido(items, colonia, compra.metodo);
  const piezas = items.reduce((s, i) => s + i.qty, 0);

  const continuar = () => {
    if (!datosOk) { setError(t("compra.faltanDatos")); return; }
    setError(""); setPaso("resumen");
  };

  const enviar = async () => {
    if (!compra.metodo) { setError(t("compra.faltaPago")); return; }
    setEnviando(true); setError("");
    try {
      const n = await onEnviar({
        nombre: compra.nombre.trim(), telefono: soloDigitos(compra.telefono),
        items, articulos: piezas, ...tot, metodoPago: compra.metodo,
        coloniaId: colonia?.id || "", colonia: colonia?.colonia || "", municipio: colonia?.municipio || "",
        direccion: (compra.calle || "").trim(),
      });
      setFolio(n); setPaso("enviado");
    } catch (e) {
      console.error(e);
      setError(e?.message || t("general.errorGuardar"));
    }
    setEnviando(false);
  };

  if (paso === "enviado") {
    return (
      <Modal onClose={onTerminar} title=" ">
        <div className="text-center pb-2">
          <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ background: "#E4F3E6", color: VERDE }}><Check size={30} /></div>
          <T k="compra.gracias" as="p" className="font-display text-2xl leading-tight mt-4 block" />
          {folio && <p className="text-sm mt-3" style={{ color: "#8C89A0" }}>{t("compra.folio", { folio: `PV-${String(folio).padStart(4, "0")}` })}</p>}
          <button type="button" onClick={onTerminar} className="w-full mt-6 rounded-xl py-3 text-sm font-medium" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>{t("compra.cerrar")}</button>
        </div>
      </Modal>
    );
  }

  if (paso === "datos") {
    return (
      <Modal onClose={onCerrar} title={<T k="pedido.titulo" />}>
        <T k="compra.nombrePregunta" as="p" className="font-display text-xl leading-snug mb-4 block" />
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs" style={{ color: "#4A4760" }}>{t("compra.nombre")} *</span>
            <input autoFocus value={compra.nombre || ""} onChange={(e) => set("nombre", e.target.value)} className={inputCls} style={inputStyle} autoComplete="name" />
          </label>
          <label className="block">
            <span className="text-xs" style={{ color: "#4A4760" }}>{t("compra.telefono")} *</span>
            <input value={compra.telefono || ""} onChange={(e) => set("telefono", e.target.value)} className={inputCls} style={inputStyle}
              type="tel" inputMode="tel" autoComplete="tel" placeholder="55 1234 5678" onKeyDown={(e) => e.key === "Enter" && continuar()} />
          </label>
        </div>
        {error && <p className="text-xs mt-3" style={{ color: "#B23B3B" }}>{error}</p>}
        <button type="button" onClick={continuar} className="w-full mt-5 rounded-xl py-3 text-sm font-medium" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>{t("compra.continuar")}</button>
      </Modal>
    );
  }

  return (
    <Modal onClose={onCerrar} title={<T k="compra.resumenTitulo" />} wide>
      {/* Membrete */}
      <div className="rounded-2xl p-4 mb-4" style={{ background: "#fff", border: "1px solid #E6E3EE" }}>
        <div className="flex items-start justify-between gap-3">
          <img src={MARCA.logo} alt="B&C Market" className="h-10 sm:h-12 w-auto max-w-[60%] object-contain object-left" />
          <p className="text-[11px] text-right" style={{ color: "#8C89A0" }}>{new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}</p>
        </div>
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t text-sm" style={{ borderColor: "#EEECF3" }}>
          <span className="min-w-0 truncate"><strong>{compra.nombre}</strong> · <span style={{ color: "#8C89A0" }}>{compra.telefono}</span></span>
          <button type="button" onClick={() => setPaso("datos")} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#ECE8F6" }} aria-label="Cambiar nombre o teléfono"><Pencil size={12} color="#4A4760" /></button>
        </div>
      </div>

      <T k="compra.revisa" as="p" className="text-sm mb-3 block" style={{ color: "#4A4760" }} />

      {/* Artículos */}
      {cart.length === 0 ? (
        <T k="pedido.vacio" as="p" className="text-sm py-6 text-center block" style={{ color: "#8C89A0" }} />
      ) : (
        <div className="rounded-2xl border divide-y" style={{ borderColor: "#E6E3EE", background: "#fff" }}>
          {cart.map((i) => (
            <div key={i.id} className="flex items-center gap-3 p-3" style={{ borderColor: "#EEECF3" }}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{i.nombre}</p>
                <p className="text-[11px]" style={{ color: "#8C89A0" }}>{[i.detalle, t("pedido.cadaUno", { precio: money(i.precioVenta) })].filter(Boolean).join(" · ")}</p>
                <p className="text-sm font-semibold mt-0.5">{money((Number(i.precioVenta) || 0) * i.qty)}</p>
              </div>
              <Contador valor={i.qty} max={Math.max(i.qty, stockDe(i.id))} onCambiar={(n) => onQty(i.id, n)} />
              <button type="button" onClick={() => onQuitar(i.id)} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#FBEAEA" }} aria-label="Eliminar artículo"><Trash2 size={13} color="#B23B3B" /></button>
            </div>
          ))}
        </div>
      )}

      {cart.length > 0 && (
        <>
          {/* Método de pago */}
          <T k="compra.metodo" as="p" className="text-xs font-semibold tracking-widest uppercase mt-5 mb-2 block" style={{ color: "#4A4760" }} />
          <div className="grid grid-cols-3 gap-2">
            {METODOS.map(([v, k, Icono]) => {
              const activo = compra.metodo === v;
              return (
                <button key={v} type="button" onClick={() => { set("metodo", v); setError(""); }}
                  className="rounded-xl py-3 px-1 flex flex-col items-center gap-1.5 text-xs font-medium border transition"
                  style={activo ? { background: "var(--colorBoton)", color: "var(--colorBotonTexto)", borderColor: "var(--colorBoton)" } : { background: "#fff", color: "#4A4760", borderColor: "#E3E0EC" }}>
                  <Icono size={18} /> {t(k)}
                </button>
              );
            })}
          </div>

          {/* Entrega */}
          {compra.metodo && (
            <div className="mt-5">
              <p className="font-display text-lg leading-snug">{t("compra.dondeEnvio", { nombre: (compra.nombre || "").trim().split(" ")[0] })}</p>
              {!colonia && <T k="compra.direccionOpcional" as="p" className="text-xs mt-0.5 mb-2 block" style={{ color: "#8C89A0" }} />}
              {colonia && <div className="mb-2" />}
              <SelectorColonia colonias={colonias} valor={colonia} onElegir={(c) => { set("coloniaId", c ? c.id : ""); setError(""); }} />
              {colonia && (
                <>
                  <textarea rows={2} value={compra.calle || ""} onChange={(e) => set("calle", e.target.value)} placeholder={t("compra.calle")}
                    className={inputCls + " mt-2 resize-none"} style={inputStyle} />
                  <MensajeEnvio colonia={colonia} />
                </>
              )}
              {compra.metodo === "tarjeta" && (
                <p className="text-xs mt-3 rounded-xl px-3 py-2.5 flex gap-2" style={{ background: "#FDF4E7", color: "#7A5A22" }}>
                  <CreditCard size={14} className="flex-shrink-0 mt-px" /> {t("compra.notaTarjeta")}
                </p>
              )}
              {compra.metodo === "transferencia" && <DatosTransferencia />}
            </div>
          )}

          {/* Totales */}
          <div className="rounded-2xl p-4 mt-5 space-y-1.5 text-sm" style={{ background: "#EEEDF3" }}>
            <Renglon k="compra.subtotal" valor={`${money(tot.subtotal)}`} extra={`(${t(piezas === 1 ? "pedido.articulo" : "pedido.articulos", { n: piezas })})`} />
            <Renglon k="compra.envio" valor={!colonia ? t("compra.envioPorAcordar") : tot.puntoMedio ? "Punto medio" : tot.envio > 0 ? money(tot.envio) : t("compra.envioGratis")} />
            {tot.cargoTarjeta > 0 && <Renglon k="compra.cargo" valor={money(tot.cargoTarjeta)} />}
            <div className="flex items-center justify-between pt-2 mt-1 border-t" style={{ borderColor: "#DCD8E8" }}>
              <T k="pedido.total" as="span" className="font-medium" />
              <span className="font-display text-2xl">{money(tot.total)}</span>
            </div>
          </div>

          {error && <p className="text-xs mt-3" style={{ color: "#B23B3B" }}>{error}</p>}
          <button type="button" onClick={enviar} disabled={enviando}
            className="w-full mt-4 rounded-xl py-3.5 flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-60"
            style={{ background: compra.metodo ? VERDE : "#9BC4A3", color: "#fff" }}>
            <Send size={15} /> {enviando ? t("compra.enviando") : t("compra.enviarPedido")}
          </button>
        </>
      )}
    </Modal>
  );
}

function Renglon({ k, valor, extra }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span style={{ color: "#4A4760" }}><T k={k} /> {extra && <span className="text-xs" style={{ color: "#8C89A0" }}>{extra}</span>}</span>
      <span className="font-medium">{valor}</span>
    </div>
  );
}

function MensajeEnvio({ colonia }) {
  const { t } = useEdicion();
  if (colonia.peligro) {
    return (
      <p className="text-sm mt-3 rounded-xl px-3 py-2.5 flex gap-2" style={{ background: "#FBEAEA", color: "#9C3B3B" }}>
        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {t("compra.sinCobertura")}
      </p>
    );
  }
  const costo = Number(colonia.envio) || 0;
  return (
    <p className="text-sm mt-3 rounded-xl px-3 py-2.5 flex items-center gap-2 font-medium" style={{ background: "#E4F3E6", color: VERDE }}>
      <Truck size={16} className="flex-shrink-0" /> {costo > 0 ? t("compra.envioCosto", { costo: money(costo) }) : t("compra.envioGratis")}
    </p>
  );
}

function SelectorColonia({ colonias, valor, onElegir }) {
  const { t } = useEdicion();
  const [q, setQ] = useState("");
  const lista = useMemo(() => {
    const term = normalizar(q);
    const base = term ? colonias.filter((c) => normalizar(`${c.colonia} ${c.municipio}`).includes(term)) : colonias;
    return [...base].sort((a, b) => a.colonia.localeCompare(b.colonia, "es"));
  }, [colonias, q]);

  if (valor) {
    return (
      <div className="rounded-xl border px-3 py-2.5 flex items-center gap-2" style={{ borderColor: "var(--colorAcento)", background: "#fff" }}>
        <MapPin size={16} style={{ color: "var(--colorAcento)" }} className="flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{valor.colonia}</p>
          <p className="text-[11px]" style={{ color: "#8C89A0" }}>{valor.municipio}</p>
        </div>
        <button type="button" onClick={() => { onElegir(null); setQ(""); }} className="text-xs px-3 py-1.5 rounded-full flex-shrink-0" style={{ background: "#ECE8F6", color: "#4A4760" }}>Cambiar</button>
      </div>
    );
  }
  return (
    <div>
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" color="#A9A6BA" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("compra.buscarColonia")}
          className="w-full rounded-xl border pl-10 pr-3 py-2.5 text-sm outline-none" style={inputStyle} />
      </div>
      <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border divide-y" style={{ borderColor: "#E6E3EE", background: "#fff" }}>
        {lista.length === 0 ? (
          <p className="text-xs p-3 text-center" style={{ color: "#8C89A0" }}>{t("compra.sinColonias")}</p>
        ) : lista.map((c) => (
          <button key={c.id} type="button" onClick={() => onElegir(c)} className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-[#F6F5FA]" style={{ borderColor: "#F0EEF5" }}>
            <span className="min-w-0">
              <span className="text-sm block truncate">{c.colonia}</span>
              <span className="text-[11px] block" style={{ color: "#8C89A0" }}>{c.municipio}</span>
            </span>
            {c.peligro
              ? <AlertTriangle size={14} color="#C2410C" className="flex-shrink-0" />
              : <span className="text-[11px] font-medium flex-shrink-0" style={{ color: Number(c.envio) > 0 ? "#4A4760" : VERDE }}>{Number(c.envio) > 0 ? money(c.envio) : t("compra.envioGratis")}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function DatosTransferencia() {
  const { t } = useEdicion();
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(NUMERO_TRANSFERENCIA); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = NUMERO_TRANSFERENCIA; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* sin portapapeles */ }
      ta.remove();
    }
    setCopiado(true); setTimeout(() => setCopiado(false), 1800);
  };
  return (
    <div className="mt-3 rounded-2xl p-3" style={{ background: "#fff", border: "1px solid #E6E3EE" }}>
      <T k="compra.transferenciaTexto" as="p" className="text-sm mb-2 block" style={{ color: "#4A4760" }} />
      <img src={MARCA.tarjeta} alt="Tarjeta para transferencia" className="w-full rounded-xl block" />
      <button type="button" onClick={copiar} className="w-full mt-3 rounded-xl px-3 py-3 flex items-center justify-between gap-2 border-2 border-dashed"
        style={{ borderColor: copiado ? VERDE : "#B9A7DD", background: copiado ? "#E4F3E6" : "#F6F2FC" }}>
        <span className="font-display text-lg tracking-wide">{numeroAgrupado(NUMERO_TRANSFERENCIA)}</span>
        <span className="flex items-center gap-1 text-xs font-medium flex-shrink-0" style={{ color: copiado ? VERDE : "var(--colorAcento)" }}>
          {copiado ? <><Check size={13} /> {t("compra.copiado")}</> : <><Copy size={13} /> Copiar</>}
        </span>
      </button>
      {!copiado && <T k="compra.copiar" as="p" className="text-[11px] mt-1.5 text-center block" style={{ color: "#8C89A0" }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5) Aviso al salir con un pedido en curso
// ---------------------------------------------------------------------------
export function AvisoSalida({ onSalir, onContinuar }) {
  const { t } = useEdicion();
  return (
    <Modal onClose={onContinuar} title={<T k="compra.salirTitulo" />} capa={80}>
      <div className="rounded-xl p-3 flex gap-2.5" style={{ background: "#FDF4E7" }}>
        <AlertTriangle size={18} color="#B0813C" className="flex-shrink-0 mt-0.5" />
        <T k="compra.salirTexto" as="p" className="text-sm block" style={{ color: "#5C4A2A" }} />
      </div>
      <div className="grid grid-cols-2 gap-3 mt-5">
        <button type="button" onClick={onSalir} className="rounded-xl py-3 text-sm font-medium border" style={{ borderColor: "#E3E0EC", color: "#B23B3B", background: "#fff" }}>{t("compra.salir")}</button>
        <button type="button" onClick={onContinuar} className="rounded-xl py-3 text-sm font-semibold" style={{ background: VERDE, color: "#fff" }}>{t("compra.seguirPedido")}</button>
      </div>
    </Modal>
  );
}
