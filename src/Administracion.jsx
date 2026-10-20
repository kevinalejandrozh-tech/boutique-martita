// ---------------------------------------------------------------------------
// Administración del negocio: órdenes de compra, órdenes de venta, finanzas
// (gastos y embalaje) y catálogo de colonias.
// ---------------------------------------------------------------------------
import React, { useMemo, useState } from "react";
import {
  Plus, Trash2, Check, X, AlertTriangle, MapPin, Phone, MessageCircle, ChevronDown, ChevronUp,
  Truck, ClipboardList, PackageCheck, PackagePlus, Save, Search, Receipt, Wallet, Box, Pencil,
  Landmark, Banknote, CreditCard, DollarSign, RotateCcw,
} from "lucide-react";
import { Modal, Field, inputCls, inputStyle } from "./ui";
import {
  money, uid, hoyStr, normalizar, redondear, formatoFolio, totalesOC, IVA, CONCEPTOS_GASTO, conceptoNombre,
  guardarOrdenCompra, eliminarOrdenCompra, guardarGasto, eliminarGasto, guardarEmbalaje, COLONIAS_IZCALLI,
  esVariable, datosVariante, claveVariante, stockVariante,
} from "./negocio";

const VERDE = "#2F8542";
const ROJO = "#B23B3B";
const GRIS = "#8C89A0";
const fechaCorta = (ts) => (ts ? new Date(ts).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fechaHora = (ts) => (ts ? new Date(ts).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const fechaDeStr = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return y && m && d ? new Date(y, m - 1, d, 12).getTime() : null; };

function Seccion({ titulo, icono, accion, children }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "#E6E3EE", background: "#fff" }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-xs font-semibold tracking-widest uppercase flex items-center gap-1.5" style={{ color: "#4A4760" }}>{icono}{titulo}</h3>
        {accion}
      </div>
      {children}
    </div>
  );
}

function Pildora({ activo, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1 transition"
      style={activo ? { background: "var(--colorBoton)", color: "var(--colorBotonTexto)" } : { background: "#F6F5FA", color: "#4A4760" }}>
      {children}
    </button>
  );
}

// ===========================================================================
// ORDEN DE COMPRA
// ===========================================================================
// En prendas con tallas y colores, cada renglón lleva el color (`colorId`) y la talla (`tallaSel`).
const filaVacia = () => ({ key: uid(), cantidad: "", articulo: "", productoId: null, costo: "", precio: "", colorId: "", tallaSel: "" });
const filaConDatos = (i) => (i.articulo || "").trim() || i.cantidad !== "" || i.costo !== "" || i.precio !== "";
const conFilaFinal = (items) => (items.length && !filaConDatos(items[items.length - 1]) ? items : [...items, filaVacia()]);
const desdeVariante = (v) => { const [c, ...t] = String(v || "").split("|"); return v ? { colorId: c, tallaSel: t.join("|") } : { colorId: "", tallaSel: "" }; };

export function OrdenCompraModal({ oc, products, categorias, onCerrar, avisar }) {
  const soloLectura = oc?.estado === "recibida";
  const [d, setD] = useState(() => (oc
    ? { ...oc, costoEnvio: oc.costoEnvio || "", items: (soloLectura ? (x) => x : conFilaFinal)((oc.items || []).map((i) => ({ ...i, ...desdeVariante(i.variante), key: uid() }))) }
    : {
      proveedor: "", direccion: "", telefono: "", envioGratis: true, costoEnvio: "",
      fechaSolicitud: hoyStr(), fechaRecepcion: hoyStr(), ivaIncluido: true, categoriaNuevos: "",
      items: [filaVacia(), filaVacia(), filaVacia()],
    }));
  const [activa, setActiva] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const setFila = (key, cambios) => setD((x) => ({ ...x, items: conFilaFinal(x.items.map((i) => (i.key === key ? { ...i, ...cambios } : i))) }));
  const quitarFila = (key) => setD((x) => ({ ...x, items: conFilaFinal(x.items.filter((i) => i.key !== key)) }));

  const porNombre = useMemo(() => new Map(products.map((p) => [normalizar(p.nombre), p])), [products]);
  const productoDe = (i) => (i.productoId ? products.find((p) => p.id === i.productoId) : porNombre.get(normalizar(i.articulo))) || null;

  const validos = d.items.filter((i) => (i.articulo || "").trim() && Number(i.cantidad) > 0);
  const tot = totalesOC(validos, d.ivaIncluido);
  const nuevos = validos.filter((i) => !productoDe(i)).length;
  const piezas = validos.reduce((s, i) => s + Math.floor(Number(i.cantidad) || 0), 0);

  const sugerencias = (i) => {
    const term = normalizar(i.articulo);
    if (!term) return [];
    return products.filter((p) => p.id !== i.productoId && normalizar(`${p.clave || ""} ${p.nombre}`).includes(term)).slice(0, 8);
  };

  const elegir = (key, p) => {
    setD((x) => ({
      ...x,
      items: conFilaFinal(x.items.map((i) => (i.key !== key ? i : {
        ...i, articulo: p.nombre, productoId: p.id,
        costo: i.costo !== "" ? i.costo : (Number(p.precioCompra) || ""),
        precio: i.precio !== "" ? i.precio : (Number(p.precioVenta) || ""),
        cantidad: i.cantidad !== "" ? i.cantidad : 1,
        colorId: esVariable(p) && p.colores.length === 1 ? p.colores[0].id : "",
        tallaSel: esVariable(p) && p.tallas.length === 1 ? p.tallas[0] : "",
      }))),
    }));
    setActiva(null);
  };

  // Otro renglón del mismo modelo (otra talla o color), justo debajo.
  const duplicarFila = (key) => setD((x) => {
    const k = x.items.findIndex((i) => i.key === key);
    if (k < 0) return x;
    const base = x.items[k];
    const copia = { ...filaVacia(), articulo: base.articulo, productoId: base.productoId, costo: base.costo, precio: base.precio, colorId: base.colorId };
    return { ...x, items: conFilaFinal([...x.items.slice(0, k + 1), copia, ...x.items.slice(k + 1)]) };
  });

  const varianteDe = (i, p) => (p && esVariable(p) && i.colorId && i.tallaSel ? datosVariante(p, claveVariante(i.colorId, i.tallaSel)) : null);

  const guardar = async (recibir) => {
    setError("");
    const faltaTalla = validos.filter((i) => { const p = productoDe(i); return p && esVariable(p) && !varianteDe(i, p); });
    if (faltaTalla.length) { setError(`Elige color y talla de: ${[...new Set(faltaTalla.map((i) => i.articulo.trim()))].join(", ")}.`); return; }
    const items = validos.map((i) => {
      const p = productoDe(i);
      const v = varianteDe(i, p);
      return {
        cantidad: Math.floor(Number(i.cantidad) || 0), articulo: i.articulo.trim(), productoId: p ? p.id : null, costo: Number(i.costo) || 0, precio: Number(i.precio) || 0,
        ...(v ? { variante: v.clave, color: v.color, talla: v.talla } : {}),
      };
    });
    if (!items.length) { setError("Agrega al menos un artículo con cantidad."); return; }
    if (recibir && !window.confirm(`¿Recibir la orden de compra? Se sumarán ${piezas} pieza(s) al catálogo${nuevos ? ` y se crearán ${nuevos} artículo(s) nuevo(s)` : ""}.`)) return;
    setGuardando(true);
    try {
      const { folio } = await guardarOrdenCompra({
        ...(oc?.id ? { id: oc.id, createdAt: oc.createdAt || Date.now() } : {}),
        proveedor: (d.proveedor || "").trim(), direccion: (d.direccion || "").trim(), telefono: (d.telefono || "").trim(),
        envioGratis: Boolean(d.envioGratis), costoEnvio: d.envioGratis ? 0 : Number(d.costoEnvio) || 0,
        fechaSolicitud: d.fechaSolicitud || "", fechaRecepcion: d.fechaRecepcion || "",
        ivaIncluido: Boolean(d.ivaIncluido), categoriaNuevos: d.categoriaNuevos || "", items,
      }, { recibir });
      avisar(`${formatoFolio("OC", folio)} ${recibir ? "recibida: catálogo actualizado" : "guardada como pendiente"}`);
      onCerrar();
    } catch (e) {
      console.error(e);
      setError(e?.message || "No se pudo guardar. Revisa tu conexión.");
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!window.confirm("¿Eliminar esta orden de compra pendiente?")) return;
    await eliminarOrdenCompra(oc);
    avisar("Orden eliminada");
    onCerrar();
  };

  const celda = "w-full bg-transparent px-2 py-2.5 text-sm outline-none focus:bg-[#F6F2FC] disabled:opacity-80";
  const titulo = oc?.folio ? `${formatoFolio("OC", oc.folio)}${soloLectura ? " · recibida" : ""}` : "Orden de compra";

  return (
    <Modal onClose={onCerrar} title={titulo} muyAncho>
      <fieldset disabled={soloLectura || guardando} className="space-y-4 min-w-0">
        {/* Datos del proveedor */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Proveedor"><input value={d.proveedor} onChange={(e) => set("proveedor", e.target.value)} className={inputCls} style={inputStyle} placeholder="Nombre del proveedor" /></Field>
          <Field label="Teléfono"><input value={d.telefono} onChange={(e) => set("telefono", e.target.value)} type="tel" inputMode="tel" className={inputCls} style={inputStyle} /></Field>
          <div className="sm:col-span-2"><Field label="Dirección"><input value={d.direccion} onChange={(e) => set("direccion", e.target.value)} className={inputCls} style={inputStyle} /></Field></div>
          <Field label="Fecha de solicitud"><input type="date" value={d.fechaSolicitud} onChange={(e) => set("fechaSolicitud", e.target.value)} className={inputCls} style={inputStyle} /></Field>
          <Field label="Fecha de recepción"><input type="date" value={d.fechaRecepcion} onChange={(e) => set("fechaRecepcion", e.target.value)} className={inputCls} style={inputStyle} /></Field>
        </div>

        <div>
          <span className="text-xs" style={{ color: "#4A4760" }}>Envío</span>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Pildora activo={d.envioGratis} onClick={() => set("envioGratis", true)}>Envío gratis</Pildora>
            <Pildora activo={!d.envioGratis} onClick={() => set("envioGratis", false)}>Con costo de envío</Pildora>
            {!d.envioGratis && (
              <input type="number" min="0" step="any" inputMode="decimal" value={d.costoEnvio} onChange={(e) => set("costoEnvio", e.target.value)}
                placeholder="$ costo" className="w-32 rounded-xl border px-3 py-2 text-sm" style={inputStyle} />
            )}
          </div>
          {!d.envioGratis && <p className="text-[11px] mt-1" style={{ color: GRIS }}>El envío se registra solo como gasto al recibir la orden.</p>}
        </div>

        {/* Tabla tipo Excel */}
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#DCD8E8", background: "#fff" }}>
          <table className="w-full border-collapse" style={{ minWidth: 620 }}>
            <thead>
              <tr className="text-[11px] uppercase tracking-wide" style={{ background: "#EEEDF3", color: "#4A4760" }}>
                <th className="text-left font-semibold px-2 py-2 w-20 border-r" style={{ borderColor: "#DCD8E8" }}>Cantidad</th>
                <th className="text-left font-semibold px-2 py-2 border-r" style={{ borderColor: "#DCD8E8" }}>Artículo</th>
                <th className="text-left font-semibold px-2 py-2 w-28 border-r" style={{ borderColor: "#DCD8E8" }}>Costo unit.</th>
                <th className="text-left font-semibold px-2 py-2 w-28 border-r" style={{ borderColor: "#DCD8E8" }}>Precio venta</th>
                <th className="text-right font-semibold px-2 py-2 w-28">Total</th>
                {!soloLectura && <th className="w-9" />}
              </tr>
            </thead>
            <tbody>
              {d.items.map((i) => {
                const p = productoDe(i);
                const sug = activa === i.key ? sugerencias(i) : [];
                const totalFila = (Number(i.cantidad) || 0) * (Number(i.costo) || 0);
                return (
                  <React.Fragment key={i.key}>
                    <tr className="border-t align-top" style={{ borderColor: "#E6E3EE" }}>
                      <td className="border-r" style={{ borderColor: "#E6E3EE" }}>
                        <input type="number" min="0" step="1" inputMode="numeric" value={i.cantidad} onChange={(e) => setFila(i.key, { cantidad: e.target.value })} className={celda} />
                      </td>
                      <td className="border-r" style={{ borderColor: "#E6E3EE" }}>
                        <input value={i.articulo} placeholder="Escribe o elige del catálogo"
                          onChange={(e) => {
                            const texto = e.target.value;
                            const vinculado = i.productoId && products.find((x) => x.id === i.productoId);
                            const sigue = vinculado && normalizar(vinculado.nombre) === normalizar(texto);
                            setFila(i.key, { articulo: texto, productoId: sigue ? i.productoId : null, ...(sigue ? {} : { colorId: "", tallaSel: "" }) });
                            setActiva(i.key);
                          }}
                          onFocus={() => setActiva(i.key)} onBlur={() => setTimeout(() => setActiva((a) => (a === i.key ? null : a)), 180)}
                          className={celda} />
                        {p && esVariable(p) ? (
                          <FilaVariante i={i} p={p} v={varianteDe(i, p)} soloLectura={soloLectura}
                            onCambiar={(cambios) => setFila(i.key, cambios)} onOtra={() => duplicarFila(i.key)} />
                        ) : (i.articulo || "").trim() && (
                          <span className="block px-2 pb-1.5 text-[10px] font-medium" style={{ color: p ? VERDE : "var(--colorAcento)" }}>
                            {p ? `En catálogo · se suman a ${p.cantidad} pza` : soloLectura && i.talla ? `${i.color} · ${i.talla}` : "Artículo nuevo"}
                          </span>
                        )}
                      </td>
                      <td className="border-r" style={{ borderColor: "#E6E3EE" }}>
                        <input type="number" min="0" step="any" inputMode="decimal" value={i.costo} onChange={(e) => setFila(i.key, { costo: e.target.value })} className={celda} placeholder="$" />
                      </td>
                      <td className="border-r" style={{ borderColor: "#E6E3EE" }}>
                        <input type="number" min="0" step="any" inputMode="decimal" value={i.precio} onChange={(e) => setFila(i.key, { precio: e.target.value })} className={celda} placeholder="$" />
                      </td>
                      <td className="px-2 py-2.5 text-right text-sm font-medium">{totalFila ? money(totalFila) : ""}</td>
                      {!soloLectura && (
                        <td className="text-center">
                          {filaConDatos(i) && (
                            <button type="button" onClick={() => quitarFila(i.key)} className="w-7 h-7 mt-1.5 rounded-full inline-flex items-center justify-center" style={{ background: "#FBEAEA" }} aria-label="Quitar renglón"><X size={12} color={ROJO} /></button>
                          )}
                        </td>
                      )}
                    </tr>
                    {sug.length > 0 && (
                      <tr>
                        <td colSpan={soloLectura ? 5 : 6} className="px-2 pb-2" style={{ background: "#F6F2FC" }}>
                          <p className="text-[10px] uppercase tracking-wide pt-2 pb-1" style={{ color: GRIS }}>Del catálogo (las piezas se suman)</p>
                          <div className="flex flex-col gap-1">
                            {sug.map((s) => (
                              <button key={s.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(i.key, s)}
                                className="text-left rounded-lg px-3 py-2 flex items-center justify-between gap-2" style={{ background: "#fff" }}>
                                <span className="text-sm truncate">{s.clave ? <strong>{s.clave} </strong> : null}{s.nombre}{s.talla || s.color ? <span style={{ color: GRIS }}> · {[s.talla, s.color].filter(Boolean).join(" · ")}</span> : null}</span>
                                <span className="text-[11px] flex-shrink-0" style={{ color: GRIS }}>{s.cantidad} pza · {money(s.precioVenta)}</span>
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totales e IVA */}
        <div className="grid sm:grid-cols-2 gap-4 items-start">
          <div>
            <span className="text-xs" style={{ color: "#4A4760" }}>¿Los costos incluyen IVA?</span>
            <div className="flex flex-wrap gap-2 mt-1">
              <Pildora activo={d.ivaIncluido} onClick={() => set("ivaIncluido", true)}>Sí, incluyen IVA</Pildora>
              <Pildora activo={!d.ivaIncluido} onClick={() => set("ivaIncluido", false)}>No, agregar 16%</Pildora>
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: GRIS }}>El costo de cada artículo se guarda con IVA.</p>
            {nuevos > 0 && !soloLectura && (
              <div className="mt-3">
                <Field label={`Categoría para los ${nuevos} artículo(s) nuevo(s)`}>
                  <select value={d.categoriaNuevos} onChange={(e) => set("categoriaNuevos", e.target.value)} className={inputCls} style={inputStyle}>
                    <option value="">Sin categoría</option>
                    {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
            )}
          </div>
          <div className="rounded-xl p-3 space-y-1.5 text-sm" style={{ background: "#EEEDF3" }}>
            <div className="flex justify-between"><span style={{ color: "#4A4760" }}>Total ({piezas} pza)</span><span className="font-medium">{money(tot.total)}</span></div>
            <div className="flex justify-between"><span style={{ color: "#4A4760" }}>IVA {Math.round(IVA * 100)}% {d.ivaIncluido ? "(incluido)" : ""}</span><span>{money(tot.iva)}</span></div>
            <div className="flex justify-between pt-1.5 border-t" style={{ borderColor: "#DCD8E8" }}><span className="font-medium">Total con IVA</span><span className="font-display text-xl">{money(tot.totalConIva)}</span></div>
            <div className="flex justify-between text-xs pt-1" style={{ color: GRIS }}><span>Envío (gasto aparte)</span><span>{d.envioGratis ? "Gratis" : money(d.costoEnvio)}</span></div>
          </div>
        </div>
      </fieldset>

      {error && <p className="text-xs mt-3" style={{ color: ROJO }}>{error}</p>}
      {soloLectura ? (
        <p className="text-xs mt-4 rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ background: "#E4F3E6", color: VERDE }}>
          <PackageCheck size={14} /> Recibida el {fechaCorta(oc.recibidaAt)}. Las piezas ya se sumaron al catálogo.
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2 mt-5">
          {oc?.id && (
            <button type="button" onClick={eliminar} disabled={guardando} className="rounded-xl py-3 px-4 text-sm flex items-center justify-center gap-1.5" style={{ background: "#FBEAEA", color: ROJO }}><Trash2 size={14} /> Eliminar</button>
          )}
          <button type="button" onClick={() => guardar(false)} disabled={guardando} className="flex-1 rounded-xl py-3 text-sm font-medium border flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ borderColor: "#E3E0EC", color: "#4A4760", background: "#fff" }}>
            <Save size={14} /> Guardar pendiente
          </button>
          <button type="button" onClick={() => guardar(true)} disabled={guardando} className="flex-1 rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ background: VERDE, color: "#fff" }}>
            <PackageCheck size={15} /> {guardando ? "Guardando…" : "Recibir orden de compra"}
          </button>
        </div>
      )}
    </Modal>
  );
}

// Color y talla de un renglón de la orden de compra (prendas con tallas y colores).
function FilaVariante({ i, p, v, soloLectura, onCambiar, onOtra }) {
  const sel = "rounded-lg border px-2 py-1.5 text-xs bg-white outline-none min-w-0 flex-1";
  if (soloLectura) {
    return <span className="block px-2 pb-1.5 text-[10px] font-medium" style={{ color: VERDE }}>{[i.color, i.talla].filter(Boolean).join(" · ") || "En catálogo"}</span>;
  }
  return (
    <div className="px-2 pb-2">
      <div className="flex gap-1.5">
        <select value={i.colorId || ""} onChange={(e) => onCambiar({ colorId: e.target.value })} className={sel} style={{ borderColor: i.colorId ? "#DCD8E8" : "#E7B9B9" }} aria-label="Color">
          <option value="">Color…</option>
          {p.colores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value={i.tallaSel || ""} onChange={(e) => onCambiar({ tallaSel: e.target.value })} className={sel} style={{ borderColor: i.tallaSel ? "#DCD8E8" : "#E7B9B9" }} aria-label="Talla">
          <option value="">Talla…</option>
          {p.tallas.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-[10px] font-medium" style={{ color: v ? VERDE : ROJO }}>
          {v ? `Se suman a ${stockVariante(p, v.clave)} pza de ${v.texto}` : "Elige color y talla"}
        </span>
        <button type="button" onClick={onOtra} className="text-[10px] font-medium flex items-center gap-0.5 flex-shrink-0" style={{ color: "var(--colorAcento)" }}>
          <Plus size={11} /> Otra talla/color
        </button>
      </div>
    </div>
  );
}

export function ListaOC({ ocs, onAbrir, vacio }) {
  if (!ocs.length) return vacio ? <p className="text-sm py-4 text-center" style={{ color: "#A9A6BA" }}>{vacio}</p> : null;
  return (
    <div className="space-y-2">
      {ocs.map((oc) => (
        <button key={oc.id} type="button" onClick={() => onAbrir(oc)} className="w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-3" style={{ borderColor: "#E6E3EE", background: "#fff" }}>
          <ClipboardList size={18} style={{ color: oc.estado === "recibida" ? VERDE : "var(--colorAcento)" }} className="flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{formatoFolio("OC", oc.folio)} · {oc.proveedor || "Sin proveedor"}</p>
            <p className="text-[11px]" style={{ color: GRIS }}>{(oc.items || []).length} artículo(s) · {oc.estado === "recibida" ? `recibida ${fechaCorta(oc.recibidaAt)}` : `solicitada ${fechaCorta(fechaDeStr(oc.fechaSolicitud) || oc.createdAt)}`}</p>
          </div>
          <span className="text-sm font-medium flex-shrink-0">{money(oc.totalConIva)}</span>
          <span className="text-[10px] font-medium px-2 py-1 rounded-full uppercase flex-shrink-0" style={oc.estado === "recibida" ? { background: "#E4F3E6", color: VERDE } : { background: "#FDF4E7", color: "#B0813C" }}>
            {oc.estado === "recibida" ? "Recibida" : "Pendiente"}
          </span>
        </button>
      ))}
    </div>
  );
}

// ===========================================================================
// ÓRDENES DE VENTA
// ===========================================================================
const METODO_PAGO = { transferencia: ["Transferencia", Landmark], efectivo: ["Efectivo", Banknote], tarjeta: ["Tarjeta", CreditCard] };

export function OrdenesVentaTab({ pedidos, onConfirmar, onCancelar, onWhatsApp }) {
  const [filtro, setFiltro] = useState("pendiente");
  const pendientes = pedidos.filter((p) => p.estado === "pendiente").length;
  const lista = useMemo(() => pedidos
    .filter((p) => filtro === "todos" || p.estado === filtro)
    .sort((a, b) => (filtro === "pendiente" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt)), [pedidos, filtro]);

  return (
    <div className="pt-6 space-y-4">
      <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: pendientes ? "#E4F3E6" : "#F6F2FC", border: `1px solid ${pendientes ? "#CBE6D0" : "#E8E1F5"}` }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center font-display text-2xl flex-shrink-0" style={{ background: pendientes ? VERDE : "#ECE4F7", color: pendientes ? "#fff" : "var(--colorAcento)" }}>{pendientes}</div>
        <div>
          <p className="font-display text-lg leading-tight">{pendientes === 1 ? "1 pedido pendiente" : `${pendientes} pedidos pendientes`}</p>
          <p className="text-xs" style={{ color: GRIS }}>Al confirmar se descuentan las piezas y se registra la venta. Puedes elegir si se envía el WhatsApp al cliente.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[["pendiente", "Pendientes"], ["confirmado", "Confirmadas"], ["cancelado", "Canceladas"], ["todos", "Todas"]].map(([v, l]) => (
          <Pildora key={v} activo={filtro === v} onClick={() => setFiltro(v)}>{l} ({v === "todos" ? pedidos.length : pedidos.filter((p) => p.estado === v).length})</Pildora>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="text-sm py-12 text-center" style={{ color: "#A9A6BA" }}>No hay órdenes en esta vista.</p>
      ) : (
        <div className="space-y-3">
          {lista.map((p) => <TarjetaPedido key={p.id} p={p} onConfirmar={onConfirmar} onCancelar={onCancelar} onWhatsApp={onWhatsApp} />)}
        </div>
      )}
    </div>
  );
}

function TarjetaPedido({ p, onConfirmar, onCancelar, onWhatsApp }) {
  const [abierto, setAbierto] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [metodo, IconoMetodo] = METODO_PAGO[p.metodoPago] || ["—", Wallet];
  const estado = {
    pendiente: { txt: "Pendiente", bg: "#FDF4E7", c: "#B0813C" },
    confirmado: { txt: "Confirmada", bg: "#E4F3E6", c: VERDE },
    cancelado: { txt: "Cancelada", bg: "#EEECF3", c: "#7C7990" },
  }[p.estado] || { txt: p.estado, bg: "#EEECF3", c: "#7C7990" };

  const confirmar = async () => {
    setTrabajando(true);
    try { await onConfirmar(p); } finally { setTrabajando(false); }
  };

  return (
    <div className="rounded-2xl border p-3.5" style={{ borderColor: "#E6E3EE", background: "#fff", opacity: p.estado === "cancelado" ? 0.65 : 1 }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-lg leading-none">{formatoFolio("PV", p.folio)}</span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full uppercase" style={{ background: estado.bg, color: estado.c }}>{estado.txt}</span>
          </div>
          <p className="text-[11px] mt-1" style={{ color: GRIS }}>{fechaHora(p.createdAt)}</p>
        </div>
        <span className="font-display text-xl flex-shrink-0">{money(p.total)}</span>
        {p.estado === "pendiente" && (
          <button type="button" onClick={confirmar} disabled={trabajando} className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-50" style={{ background: VERDE, color: "#fff" }} aria-label="Confirmar pedido" title="Confirmar pedido">
            <Check size={20} />
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-3 pt-3 border-t text-sm" style={{ borderColor: "#EEECF3" }}>
        <p className="font-medium truncate">{p.nombre}</p>
        <a href={`tel:${p.telefono}`} className="flex items-center gap-1.5" style={{ color: "var(--colorAcento)" }}><Phone size={13} /> {p.telefono}</a>
        <p className="flex items-start gap-1.5 sm:col-span-2" style={{ color: "#4A4760" }}>
          <MapPin size={13} className="flex-shrink-0 mt-1" />
          <span>{[p.direccion, p.colonia, p.municipio].filter(Boolean).join(", ") || "Sin dirección: entrega por acordar"}</span>
        </p>
        <p className="flex items-center gap-1.5 text-xs" style={{ color: p.puntoMedio ? "#C2410C" : "#4A4760" }}>
          {p.puntoMedio ? <AlertTriangle size={13} /> : <Truck size={13} />}
          {p.puntoMedio ? "Sin cobertura: acordar punto medio" : !p.colonia ? "Envío por acordar" : p.envio > 0 ? `Envío ${money(p.envio)}` : "Envío gratis"}
        </p>
        <p className="flex items-center gap-1.5 text-xs" style={{ color: "#4A4760" }}>
          <IconoMetodo size={13} /> {metodo}{p.cargoTarjeta > 0 ? ` · cargo 5% ${money(p.cargoTarjeta)}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        <button type="button" onClick={() => setAbierto((v) => !v)} className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-full" style={{ background: "#F6F5FA", color: "#4A4760" }}>
          {p.articulos || (p.items || []).length} artículo(s) {abierto ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {p.estado !== "cancelado" && (
          <button type="button" onClick={() => onWhatsApp(p)} className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-full" style={{ background: "#E4F3E6", color: VERDE }}>
            <MessageCircle size={12} /> WhatsApp
          </button>
        )}
        {p.estado === "pendiente" && (
          <button type="button" onClick={() => onCancelar(p)} className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-full ml-auto" style={{ background: "#FBEAEA", color: ROJO }}>
            <X size={12} /> Cancelar
          </button>
        )}
      </div>

      {abierto && (
        <div className="mt-2 rounded-xl p-3 space-y-1.5 text-xs" style={{ background: "#F7F6FB" }}>
          {(p.items || []).map((i, k) => (
            <div key={k} className="flex justify-between gap-2">
              <span>{i.qty} × {i.nombre}{i.detalle ? <span style={{ color: GRIS }}> ({i.detalle})</span> : null}</span>
              <span className="font-medium flex-shrink-0">{money(i.precio * i.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-1.5 border-t" style={{ borderColor: "#E6E3EE", color: GRIS }}>
            <span>Productos {money(p.subtotal)} · envío {money(p.envio)}{p.cargoTarjeta ? ` · terminal ${money(p.cargoTarjeta)}` : ""}</span>
          </div>
          {p.estado === "confirmado" && (
            <p style={{ color: GRIS }}>Confirmada {fechaHora(p.confirmadoAt)}{p.costoEmbalaje ? ` · embalaje ${money(p.costoEmbalaje)}` : ""}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// FINANZAS
// ===========================================================================
const DAY_MS = 86400000;
const rango = (dias) => {
  const fin = new Date();
  const ini = new Date(fin.getTime() - (dias - 1) * DAY_MS);
  const f = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return [f(ini), f(fin)];
};

export function FinanzasTab({ products, gastos, pedidos, ocs, embalaje, onAbrirOC, onNuevaOC, avisar }) {
  const [[desde, hasta], setRango] = useState(() => rango(30));
  const ini = desde ? new Date(fechaDeStr(desde)).setHours(0, 0, 0, 0) : -Infinity;
  const fin = hasta ? new Date(fechaDeStr(hasta)).setHours(23, 59, 59, 999) : Infinity;
  const dentro = (ts) => ts && ts >= ini && ts <= fin;

  const r = useMemo(() => {
    const ventas = products.flatMap((p) => (p.ventas || []).map((v) => ({ ...v, qty: Number(v.qty) || 0, precio: Number(v.precio) || 0, costo: Number(v.costo) || 0 }))).filter((v) => dentro(v.at));
    const ventasMonto = ventas.reduce((s, v) => s + v.precio * v.qty, 0);
    const costoVendido = ventas.reduce((s, v) => s + v.costo * v.qty, 0);
    const confirmados = pedidos.filter((p) => p.estado === "confirmado" && dentro(p.confirmadoAt));
    const cobros = confirmados.reduce((s, p) => s + (Number(p.envio) || 0) + (Number(p.cargoTarjeta) || 0), 0);
    const gastosRango = gastos.filter((g) => dentro(fechaDeStr(g.fecha) || g.createdAt)).sort((a, b) => (fechaDeStr(b.fecha) || 0) - (fechaDeStr(a.fecha) || 0) || b.createdAt - a.createdAt);
    const porConcepto = Object.fromEntries(CONCEPTOS_GASTO.map(([k]) => [k, 0]));
    gastosRango.forEach((g) => { porConcepto[g.concepto in porConcepto ? g.concepto : "otro"] += Number(g.monto) || 0; });
    const totalGastos = gastosRango.reduce((s, g) => s + (Number(g.monto) || 0), 0);
    return {
      ventasMonto, costoVendido, cobros, gastosRango, porConcepto, totalGastos,
      utilidad: ventasMonto + cobros - costoVendido - totalGastos,
    };
  }, [products, gastos, pedidos, ini, fin]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pt-6 space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] uppercase tracking-wide" style={{ color: GRIS }}>Desde
          <input type="date" value={desde} onChange={(e) => setRango([e.target.value, hasta])} className="block rounded-lg border px-2.5 py-1.5 text-xs mt-0.5 normal-case" style={inputStyle} />
        </label>
        <label className="text-[10px] uppercase tracking-wide" style={{ color: GRIS }}>Hasta
          <input type="date" value={hasta} onChange={(e) => setRango([desde, e.target.value])} className="block rounded-lg border px-2.5 py-1.5 text-xs mt-0.5 normal-case" style={inputStyle} />
        </label>
        {[7, 30, 90].map((n) => <Pildora key={n} onClick={() => setRango(rango(n))}>{n} días</Pildora>)}
        <Pildora onClick={() => setRango(["", ""])}>Todo</Pildora>
      </div>

      {/* Estado de resultados */}
      <Seccion titulo="Resultados del periodo" icono={<DollarSign size={14} />}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Dato etiqueta="Ventas de productos" valor={money(r.ventasMonto)} />
          <Dato etiqueta="Cobros de envío y terminal" valor={money(r.cobros)} />
          <Dato etiqueta="Costo de lo vendido" valor={`− ${money(r.costoVendido)}`} />
          <Dato etiqueta="Gastos" valor={`− ${money(r.totalGastos)}`} />
        </div>
        <div className="flex items-center justify-between rounded-xl px-4 py-3 mt-3" style={{ background: r.utilidad >= 0 ? "#E4F3E6" : "#FBEAEA" }}>
          <span className="text-sm font-medium">Utilidad neta</span>
          <span className="font-display text-2xl" style={{ color: r.utilidad >= 0 ? VERDE : ROJO }}>{money(r.utilidad)}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs" style={{ color: GRIS }}>
          {CONCEPTOS_GASTO.map(([k, l]) => <span key={k}>{l}: <strong style={{ color: "#4A4760" }}>{money(r.porConcepto[k])}</strong></span>)}
        </div>
      </Seccion>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Gastos gastos={r.gastosRango} avisar={avisar} />
        <Embalaje lista={embalaje} avisar={avisar} />
      </div>

      <Seccion titulo="Órdenes de compra" icono={<ClipboardList size={14} />} accion={
        <button type="button" onClick={onNuevaOC} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full" style={{ background: "#ECE8F6", color: "#4A4760" }}><Plus size={12} /> Nueva</button>
      }>
        <ListaOC ocs={[...ocs].sort((a, b) => b.createdAt - a.createdAt)} onAbrir={onAbrirOC} vacio="Aún no hay órdenes de compra." />
      </Seccion>
    </div>
  );
}

function Dato({ etiqueta, valor }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "#F7F6FB" }}>
      <p className="text-[10px] leading-tight" style={{ color: GRIS }}>{etiqueta}</p>
      <p className="font-display text-lg leading-tight mt-1">{valor}</p>
    </div>
  );
}

const GASTO_VACIO = () => ({ fecha: hoyStr(), concepto: "envio", descripcion: "", monto: "" });

function Gastos({ gastos, avisar }) {
  const [abierto, setAbierto] = useState(false);
  const [g, setG] = useState(GASTO_VACIO);
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setG((x) => ({ ...x, [k]: e.target.value }));

  const guardar = async (e) => {
    e.preventDefault();
    if (!(Number(g.monto) > 0)) { avisar("Escribe el monto del gasto", "error"); return; }
    setGuardando(true);
    try { await guardarGasto(g); avisar("Gasto registrado"); setG(GASTO_VACIO()); setAbierto(false); }
    catch { avisar("No se pudo guardar", "error"); }
    setGuardando(false);
  };

  const borrar = async (x) => {
    if (!window.confirm(`¿Eliminar el gasto «${x.descripcion || conceptoNombre(x.concepto)}» por ${money(x.monto)}?`)) return;
    try { await eliminarGasto(x); avisar("Gasto eliminado"); } catch { avisar("No se pudo eliminar", "error"); }
  };

  return (
    <Seccion titulo="Control de gastos" icono={<Receipt size={14} />} accion={
      <button type="button" onClick={() => setAbierto((v) => !v)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full" style={{ background: "#ECE8F6", color: "#4A4760" }}>
        {abierto ? <X size={12} /> : <Plus size={12} />} {abierto ? "Cerrar" : "Registrar gasto"}
      </button>
    }>
      {abierto && (
        <form onSubmit={guardar} className="rounded-xl p-3 mb-3 space-y-2.5" style={{ background: "#F7F6FB" }}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fecha"><input type="date" value={g.fecha} onChange={set("fecha")} className={inputCls} style={inputStyle} /></Field>
            <Field label="Concepto">
              <select value={g.concepto} onChange={set("concepto")} className={inputCls} style={inputStyle}>
                {CONCEPTOS_GASTO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Descripción"><input value={g.descripcion} onChange={set("descripcion")} className={inputCls} style={inputStyle} placeholder="Ej. gasolina entrega Arcos del Alba" /></Field>
          <div className="flex gap-2 items-end">
            <div className="flex-1"><Field label="Monto"><input required type="number" min="0" step="any" inputMode="decimal" value={g.monto} onChange={set("monto")} className={inputCls} style={inputStyle} placeholder="$" /></Field></div>
            <button type="submit" disabled={guardando} className="rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-60" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>{guardando ? "…" : "Guardar"}</button>
          </div>
        </form>
      )}
      {gastos.length === 0 ? (
        <p className="text-sm py-4 text-center" style={{ color: "#A9A6BA" }}>Sin gastos en este periodo.</p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {gastos.map((x) => (
            <div key={x.id} className="flex items-center gap-2 py-1.5 border-b last:border-0 text-xs" style={{ borderColor: "#F0EEF5" }}>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{x.descripcion || conceptoNombre(x.concepto)}</p>
                <p style={{ color: GRIS }}>{fechaCorta(fechaDeStr(x.fecha) || x.createdAt)} · {conceptoNombre(x.concepto)}{x.origen !== "manual" ? " · automático" : ""}</p>
              </div>
              <span className="font-medium flex-shrink-0">{money(x.monto)}</span>
              <button type="button" onClick={() => borrar(x)} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#FBEAEA" }} aria-label="Eliminar gasto"><Trash2 size={12} color={ROJO} /></button>
            </div>
          ))}
        </div>
      )}
    </Seccion>
  );
}

const MATERIAL_VACIO = () => ({ id: "", nombre: "", stock: "", costo: "", porPedido: 1 });

function Embalaje({ lista, avisar }) {
  const [editando, setEditando] = useState(null); // material en edición (o nuevo)
  const [entrada, setEntrada] = useState(null); // { id, qty, costo }

  const guardarLista = async (nueva, msg) => {
    try { await guardarEmbalaje(nueva); avisar(msg); return true; }
    catch { avisar("No se pudo guardar", "error"); return false; }
  };

  const guardarMaterial = async (e) => {
    e.preventDefault();
    const m = { ...editando, nombre: (editando.nombre || "").trim(), stock: Math.max(0, Math.floor(Number(editando.stock) || 0)), costo: redondear(editando.costo), porPedido: Math.max(0, Number(editando.porPedido) || 0) };
    if (!m.nombre) { avisar("Escribe el nombre del material", "error"); return; }
    const nueva = m.id ? lista.map((x) => (x.id === m.id ? m : x)) : [...lista, { ...m, id: uid() }];
    if (await guardarLista(nueva, "Material guardado")) setEditando(null);
  };

  const registrarEntrada = async (e) => {
    e.preventDefault();
    const qty = Math.floor(Number(entrada.qty) || 0);
    if (qty <= 0) { avisar("Escribe cuántas piezas entran", "error"); return; }
    const nueva = lista.map((m) => {
      if (m.id !== entrada.id) return m;
      const stock = (Number(m.stock) || 0) + qty;
      const costoNuevo = entrada.costo !== "" ? Number(entrada.costo) || 0 : Number(m.costo) || 0;
      const costo = (Number(m.stock) || 0) > 0 ? redondear(((Number(m.stock) || 0) * (Number(m.costo) || 0) + qty * costoNuevo) / stock) : costoNuevo;
      return { ...m, stock, costo };
    });
    if (await guardarLista(nueva, "Existencias actualizadas")) setEntrada(null);
  };

  const borrar = async (m) => {
    if (!window.confirm(`¿Eliminar «${m.nombre}» del inventario de embalaje?`)) return;
    await guardarLista(lista.filter((x) => x.id !== m.id), "Material eliminado");
  };

  return (
    <Seccion titulo="Materiales de embalaje" icono={<Box size={14} />} accion={
      <button type="button" onClick={() => setEditando(MATERIAL_VACIO())} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full" style={{ background: "#ECE8F6", color: "#4A4760" }}><Plus size={12} /> Material</button>
    }>
      <p className="text-[11px] mb-3" style={{ color: GRIS }}>Al confirmar cada pedido se descuenta el «uso por pedido» de cada material y su costo se registra como gasto de embalaje.</p>

      {editando && (
        <form onSubmit={guardarMaterial} className="rounded-xl p-3 mb-3 space-y-2.5" style={{ background: "#F7F6FB" }}>
          <Field label="Material"><input autoFocus value={editando.nombre} onChange={(e) => setEditando((x) => ({ ...x, nombre: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Ej. bolsa de regalo mediana" /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Existencias"><input type="number" min="0" step="1" inputMode="numeric" value={editando.stock} onChange={(e) => setEditando((x) => ({ ...x, stock: e.target.value }))} className={inputCls} style={inputStyle} /></Field>
            <Field label="Costo c/u"><input type="number" min="0" step="any" inputMode="decimal" value={editando.costo} onChange={(e) => setEditando((x) => ({ ...x, costo: e.target.value }))} className={inputCls} style={inputStyle} placeholder="$" /></Field>
            <Field label="Uso por pedido"><input type="number" min="0" step="any" inputMode="decimal" value={editando.porPedido} onChange={(e) => setEditando((x) => ({ ...x, porPedido: e.target.value }))} className={inputCls} style={inputStyle} /></Field>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditando(null)} className="flex-1 rounded-xl py-2.5 text-sm border" style={{ borderColor: "#E3E0EC", color: "#4A4760", background: "#fff" }}>Cancelar</button>
            <button type="submit" className="flex-1 rounded-xl py-2.5 text-sm font-medium" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>Guardar</button>
          </div>
        </form>
      )}

      {lista.length === 0 && !editando ? (
        <p className="text-sm py-4 text-center" style={{ color: "#A9A6BA" }}>Agrega bolsas, cajas, papel, cinta…</p>
      ) : (
        <div className="space-y-2">
          {lista.map((m) => {
            const bajo = (Number(m.stock) || 0) < Math.max(1, Number(m.porPedido) || 0) * 5;
            return (
              <div key={m.id} className="rounded-xl border p-2.5" style={{ borderColor: "#E6E3EE" }}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{m.nombre}</p>
                    <p className="text-[11px]" style={{ color: GRIS }}>{money(m.costo)} c/u · usa {m.porPedido} por pedido</p>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={bajo ? { background: "#FBEAEA", color: ROJO } : { background: "#E4F3E6", color: VERDE }}>{m.stock} pza</span>
                  <button type="button" onClick={() => setEntrada({ id: m.id, qty: "", costo: "" })} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#E4F3E6" }} aria-label="Entrada de piezas" title="Entrada de piezas"><PackagePlus size={13} color={VERDE} /></button>
                  <button type="button" onClick={() => setEditando({ ...m })} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#ECE8F6" }} aria-label="Editar material"><Pencil size={12} color="#4A4760" /></button>
                  <button type="button" onClick={() => borrar(m)} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#FBEAEA" }} aria-label="Eliminar material"><Trash2 size={12} color={ROJO} /></button>
                </div>
                {entrada?.id === m.id && (
                  <form onSubmit={registrarEntrada} className="flex gap-2 items-end mt-2 pt-2 border-t" style={{ borderColor: "#EEECF3" }}>
                    <div className="flex-1"><Field label="Piezas que entran"><input autoFocus type="number" min="1" step="1" inputMode="numeric" value={entrada.qty} onChange={(e) => setEntrada((x) => ({ ...x, qty: e.target.value }))} className={inputCls} style={inputStyle} /></Field></div>
                    <div className="flex-1"><Field label="Costo c/u"><input type="number" min="0" step="any" inputMode="decimal" value={entrada.costo} onChange={(e) => setEntrada((x) => ({ ...x, costo: e.target.value }))} className={inputCls} style={inputStyle} placeholder={String(m.costo || "$")} /></Field></div>
                    <button type="submit" className="rounded-xl px-3 py-2.5 text-sm font-medium" style={{ background: VERDE, color: "#fff" }}><Check size={15} /></button>
                    <button type="button" onClick={() => setEntrada(null)} className="rounded-xl px-3 py-2.5 text-sm border" style={{ borderColor: "#E3E0EC" }}><X size={15} /></button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Seccion>
  );
}

// ===========================================================================
// CATÁLOGO DE COLONIAS
// ===========================================================================
export function ColoniasModal({ lista, onGuardar, onCerrar }) {
  const [filas, setFilas] = useState(() => lista.map((c) => ({ ...c, envio: c.envio === null || c.envio === undefined ? "" : c.envio })));
  const [q, setQ] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cambios, setCambios] = useState(false);

  const setFila = (id, k, v) => { setFilas((f) => f.map((c) => (c.id === id ? { ...c, [k]: v } : c))); setCambios(true); };
  const agregar = () => { setFilas((f) => [{ id: uid(), colonia: "", municipio: "Cuautitlán Izcalli", envio: "", peligro: false }, ...f]); setQ(""); setCambios(true); };
  const quitar = (id) => { setFilas((f) => f.filter((c) => c.id !== id)); setCambios(true); };
  const restaurar = () => {
    if (!window.confirm("¿Agregar las colonias de Cuautitlán Izcalli que falten en la lista?")) return;
    const ya = new Set(filas.map((c) => normalizar(c.colonia)));
    setFilas((f) => [...f, ...COLONIAS_IZCALLI.filter((c) => !ya.has(normalizar(c.colonia))).map((c) => ({ ...c, id: uid(), envio: "" }))]);
    setCambios(true);
  };

  const visibles = useMemo(() => {
    const term = normalizar(q);
    return term ? filas.filter((c) => normalizar(`${c.colonia} ${c.municipio}`).includes(term) || !c.colonia) : filas;
  }, [filas, q]);
  const conPeligro = filas.filter((c) => c.peligro).length;

  const guardar = async () => {
    setGuardando(true);
    const limpia = filas
      .filter((c) => (c.colonia || "").trim())
      .map((c) => ({ id: c.id, colonia: c.colonia.trim(), municipio: (c.municipio || "").trim(), envio: c.envio === "" || c.envio === null ? null : redondear(c.envio), peligro: Boolean(c.peligro) }));
    try { await onGuardar(limpia); onCerrar(); }
    catch { setGuardando(false); }
  };

  const cerrar = () => { if (!cambios || window.confirm("Hay cambios sin guardar. ¿Cerrar de todos modos?")) onCerrar(); };

  return (
    <Modal onClose={cerrar} title="Catálogo de colonias" muyAncho>
      <p className="text-xs mb-3" style={{ color: GRIS }}>
        Envío vacío = <strong>Envío gratis</strong>. Marca <AlertTriangle size={11} className="inline -mt-0.5" color="#C2410C" /> en las colonias sin entrega directa (al cliente se le propone un punto medio).
      </p>
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" color="#A9A6BA" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar colonia" className="w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm outline-none" style={inputStyle} />
        </div>
        <button type="button" onClick={agregar} className="rounded-xl px-3 text-sm font-medium flex items-center gap-1 flex-shrink-0" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}><Plus size={14} /> Colonia</button>
      </div>
      <p className="text-[11px] mb-2" style={{ color: GRIS }}>{filas.length} colonias · {conPeligro} sin cobertura</p>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#DCD8E8", background: "#fff" }}>
        <div className="hidden sm:grid grid-cols-[1fr_170px_110px_40px_40px] text-[11px] uppercase tracking-wide font-semibold" style={{ background: "#EEEDF3", color: "#4A4760" }}>
          <span className="px-2 py-2">Colonia</span><span className="px-2 py-2">Municipio</span><span className="px-2 py-2">Envío</span><span className="py-2 text-center">⚠</span><span />
        </div>
        <div className="max-h-[52vh] overflow-y-auto divide-y" style={{ borderColor: "#EEECF3" }}>
          {visibles.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_96px_36px_36px] sm:grid-cols-[1fr_170px_110px_40px_40px] items-center" style={{ background: c.peligro ? "#FFF6EF" : undefined }}>
              <input value={c.colonia} onChange={(e) => setFila(c.id, "colonia", e.target.value)} placeholder="Nombre de la colonia"
                className="col-span-4 sm:col-span-1 w-full bg-transparent px-2 py-2 text-sm outline-none focus:bg-[#F6F2FC]" />
              <input value={c.municipio} onChange={(e) => setFila(c.id, "municipio", e.target.value)} placeholder="Municipio"
                className="hidden sm:block w-full bg-transparent px-2 py-2 text-sm outline-none focus:bg-[#F6F2FC]" style={{ color: "#4A4760" }} />
              <span className="sm:hidden px-2 pb-2 text-[11px] truncate" style={{ color: GRIS }}>{c.municipio}</span>
              <input type="number" min="0" step="any" inputMode="decimal" value={c.envio} onChange={(e) => setFila(c.id, "envio", e.target.value)} placeholder="Gratis"
                className="w-full bg-transparent px-2 py-2 text-sm outline-none focus:bg-[#F6F2FC] placeholder:text-[#2F8542]" />
              <button type="button" onClick={() => setFila(c.id, "peligro", !c.peligro)} className="w-8 h-8 mx-auto rounded-full flex items-center justify-center"
                style={{ background: c.peligro ? "#C2410C" : "#F6F5FA" }} aria-label="Sin cobertura" title="Sin entrega directa">
                <AlertTriangle size={14} color={c.peligro ? "#fff" : "#C9C5D6"} />
              </button>
              <button type="button" onClick={() => quitar(c.id)} className="w-8 h-8 mx-auto rounded-full flex items-center justify-center" aria-label="Eliminar colonia"><Trash2 size={13} color="#C9A3A3" /></button>
            </div>
          ))}
          {visibles.length === 0 && <p className="text-sm p-4 text-center" style={{ color: "#A9A6BA" }}>Sin coincidencias.</p>}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mt-4">
        <button type="button" onClick={restaurar} className="rounded-xl py-3 px-4 text-xs flex items-center justify-center gap-1.5" style={{ background: "#F6F5FA", color: "#4A4760" }}><RotateCcw size={13} /> Agregar faltantes de Cuautitlán Izcalli</button>
        <button type="button" onClick={guardar} disabled={guardando} className="flex-1 rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>
          <Save size={14} /> {guardando ? "Guardando…" : "Guardar catálogo de colonias"}
        </button>
      </div>
    </Modal>
  );
}


// ===========================================================================
// CONFIRMAR UNA ORDEN DE VENTA (con o sin WhatsApp al cliente)
// ===========================================================================
export function ConfirmarPedidoModal({ pedido, embalaje = [], onConfirmar, onCerrar }) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [extras, setExtras] = useState({}); // { idMaterial: piezas }
  const [nuevo, setNuevo] = useState({ id: "", qty: 1 });
  const [metodo] = METODO_PAGO[pedido.metodoPago] || ["—"];
  const porPedido = embalaje.filter((m) => Number(m.porPedido) > 0);
  const extrasLista = Object.entries(extras).map(([id, qty]) => ({ m: embalaje.find((x) => x.id === id), qty })).filter((x) => x.m);
  const costoExtra = extrasLista.reduce((s, x) => s + x.qty * (Number(x.m.costo) || 0), 0);
  const costoBase = porPedido.reduce((s, m) => s + Math.min(Number(m.porPedido) || 0, Number(m.stock) || 0) * (Number(m.costo) || 0), 0);
  const agregarExtra = () => {
    const qty = Math.max(1, Math.floor(Number(nuevo.qty) || 0));
    if (!nuevo.id) return;
    setExtras((x) => ({ ...x, [nuevo.id]: (x[nuevo.id] || 0) + qty }));
    setNuevo({ id: "", qty: 1 });
  };
  const quitarExtra = (id) => setExtras((x) => { const n = { ...x }; delete n[id]; return n; });
  const confirmar = async (conMensaje) => {
    setTrabajando(true); setError("");
    try { await onConfirmar(pedido, conMensaje, extras); }
    catch (e) { setError(e?.message || "No se pudo confirmar."); setTrabajando(false); }
  };
  return (
    <Modal onClose={trabajando ? () => {} : onCerrar} title={`Confirmar ${formatoFolio("PV", pedido.folio)}`}>
      <div className="rounded-xl p-3 text-sm space-y-1" style={{ background: "#fff", border: "1px solid #E6E3EE" }}>
        <p className="font-medium">{pedido.nombre} · <span style={{ color: GRIS }}>{pedido.telefono}</span></p>
        <p className="text-xs" style={{ color: "#4A4760" }}>{pedido.articulos || (pedido.items || []).length} artículo(s) · {metodo} · <strong>{money(pedido.total)}</strong></p>
      </div>
      <p className="text-sm mt-4" style={{ color: "#4A4760" }}>Se descontarán las piezas del inventario y se registrará la venta.</p>

      {/* Embalaje */}
      <div className="rounded-xl p-3 mt-4" style={{ background: "#F7F6FB" }}>
        <p className="text-xs font-semibold tracking-widest uppercase flex items-center gap-1.5" style={{ color: "#4A4760" }}><Box size={13} /> Embalaje</p>
        {embalaje.length === 0 ? (
          <p className="text-xs mt-2" style={{ color: GRIS }}>No hay materiales de embalaje. Agrégalos en Finanzas → Materiales de embalaje.</p>
        ) : (
          <>
            {porPedido.length > 0 && (
              <p className="text-[11px] mt-1.5" style={{ color: GRIS }}>
                Se usa en cada pedido: {porPedido.map((m) => `${m.porPedido} ${m.nombre}`).join(", ")}
              </p>
            )}
            {extrasLista.length > 0 && (
              <div className="mt-2 space-y-1">
                {extrasLista.map(({ m, qty }) => (
                  <div key={m.id} className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5" style={{ background: "#fff" }}>
                    <span className="flex-1 min-w-0 truncate">+ {qty} {m.nombre}</span>
                    <span style={{ color: qty > (Number(m.stock) || 0) ? ROJO : GRIS }}>hay {m.stock || 0}</span>
                    <span className="font-medium">{money(qty * (Number(m.costo) || 0))}</span>
                    <button type="button" onClick={() => quitarExtra(m.id)} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#FBEAEA" }} aria-label="Quitar embalaje"><X size={11} color={ROJO} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <select value={nuevo.id} onChange={(e) => setNuevo((x) => ({ ...x, id: e.target.value }))} className="flex-1 min-w-0 rounded-xl border px-2.5 py-2 text-xs" style={inputStyle} aria-label="Material de embalaje adicional">
                <option value="">Agregar embalaje adicional…</option>
                {embalaje.map((m) => <option key={m.id} value={m.id}>{m.nombre} · hay {m.stock || 0} · {money(m.costo)} c/u</option>)}
              </select>
              <input type="number" min="1" step="1" inputMode="numeric" value={nuevo.qty} onChange={(e) => setNuevo((x) => ({ ...x, qty: e.target.value }))}
                className="w-16 rounded-xl border px-2 py-2 text-xs text-center" style={inputStyle} aria-label="Piezas" />
              <button type="button" onClick={agregarExtra} disabled={!nuevo.id} className="rounded-xl px-3 text-xs font-medium flex items-center gap-1 disabled:opacity-40" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}><Plus size={12} /> Agregar</button>
            </div>
            <p className="text-[11px] mt-2" style={{ color: GRIS }}>Costo de embalaje (gasto): <strong style={{ color: "#4A4760" }}>{money(costoBase + costoExtra)}</strong></p>
          </>
        )}
      </div>
      <p className="font-display text-lg leading-snug mt-3">¿Quieres enviarle el mensaje de WhatsApp al cliente?</p>
      {error && <p className="text-xs mt-3 rounded-xl px-3 py-2" style={{ background: "#FBEAEA", color: ROJO }}>{error}</p>}
      <div className="grid gap-2 mt-4">
        <button type="button" disabled={trabajando} onClick={() => confirmar(true)}
          className="rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: VERDE, color: "#fff" }}>
          <MessageCircle size={15} /> Confirmar y enviar WhatsApp
        </button>
        <button type="button" disabled={trabajando} onClick={() => confirmar(false)}
          className="rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>
          <Check size={15} /> Confirmar sin mensaje
        </button>
        <button type="button" disabled={trabajando} onClick={onCerrar} className="rounded-xl py-2.5 text-sm border" style={{ borderColor: "#E3E0EC", color: "#4A4760", background: "#fff" }}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
