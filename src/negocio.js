// ---------------------------------------------------------------------------
// Negocio: pedidos de clientes, órdenes de compra, gastos, embalaje y colonias.
// Todo vive en la colección `settings` (las reglas de Firestore ya la permiten):
//   settings/pedido_{id}  · tipo "pedido"  (órdenes de venta)
//   settings/oc_{id}      · tipo "oc"      (órdenes de compra)
//   settings/gasto_{id}   · tipo "gasto"   (control de gastos)
//   settings/colonias     · { lista }      (catálogo de colonias y costo de envío)
//   settings/embalaje     · { lista }      (inventario de materiales de embalaje)
//   settings/contadores   · { pedido, oc } (folios consecutivos)
// ---------------------------------------------------------------------------
import { collection, doc, query, where, runTransaction, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

export const COLONIAS_DOC = doc(db, "settings", "colonias");
export const EMBALAJE_DOC = doc(db, "settings", "embalaje");
export const CONTADORES_DOC = doc(db, "settings", "contadores");
export const registroDoc = (tipo, id) => doc(db, "settings", `${tipo}_${id}`);
export const REGISTROS_QUERY = query(collection(db, "settings"), where("tipo", "in", ["pedido", "gasto", "oc"]));

export const IVA = 0.16;
export const CARGO_TARJETA = 0.05;
export const NUMERO_TRANSFERENCIA = "4152314489962129";
export const MARCA = { logo: "/marca/logo-membrete.png", tarjeta: "/marca/tarjeta-transferencia.jpg" };
export const CONCEPTOS_GASTO = [["envio", "Envíos"], ["traslado", "Traslados"], ["embalaje", "Embalaje"], ["otro", "Otros"]];
export const conceptoNombre = (c) => (CONCEPTOS_GASTO.find(([k]) => k === c) || [, "Otros"])[1];

export const EMPTY_PRODUCT = {
  nombre: "", categoria: "", subcategoria: "", color: "", talla: "",
  material: "", genero: "", grupo: "", precioVenta: "", precioCompra: "", cantidad: 1,
  ubicacion: "", imagen: null, disponible: true, oculto: false,
  fechaCompra: "", proveedor: "", vendidaAt: null, ventas: [],
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export function money(n) {
  const v = Number(n) || 0;
  const dec = Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2;
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: dec, maximumFractionDigits: dec });
}
export const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const normalizar = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const soloDigitos = (s) => (s || "").replace(/\D/g, "");
export const formatoFolio = (prefijo, n) => `${prefijo}-${String(Number(n) || 0).padStart(4, "0")}`;
export const hoyStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const numeroAgrupado = (n) => soloDigitos(n).replace(/(\d{4})(?=\d)/g, "$1 ");

export function whatsappUrl(telefono, texto) {
  let d = soloDigitos(telefono);
  if (d.length === 10) d = "52" + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}

// Inventario por piezas: `cantidad` es el stock actual y `ventas` el historial.
// Los productos guardados con la versión anterior (Disponible/Vendida) se leen así:
// - Vendida  → stock 0 y una venta con su fecha (se puede deshacer con el PIN).
// - Disponible → stock = cantidad registrada.
export function normalizarProducto(p) {
  if (Array.isArray(p.ventas)) {
    const n = Number(p.cantidad);
    return { ...p, cantidad: Number.isFinite(n) ? Math.max(0, n) : 0 };
  }
  const n = Number(p.cantidad) > 0 ? Math.floor(Number(p.cantidad)) : 1;
  if (p.disponible === false) {
    return {
      ...p, cantidad: 0,
      ventas: [{ id: "anterior", at: p.vendidaAt || p.createdAt || 0, qty: n, precio: Number(p.precioVenta) || 0, costo: Number(p.precioCompra) || 0 }],
    };
  }
  return { ...p, cantidad: n, ventas: [] };
}

// Totales de un pedido de cliente.
export function totalesPedido(items, colonia, metodo) {
  const subtotal = redondear(items.reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.qty) || 0), 0));
  const puntoMedio = Boolean(colonia?.peligro);
  const envio = colonia && !puntoMedio ? redondear(Number(colonia.envio) || 0) : 0;
  const cargoTarjeta = metodo === "tarjeta" ? redondear((subtotal + envio) * CARGO_TARJETA) : 0;
  return { subtotal, envio, cargoTarjeta, total: redondear(subtotal + envio + cargoTarjeta), puntoMedio };
}

// Totales de una orden de compra. `ivaIncluido`: los costos ya traen IVA.
export function totalesOC(items, ivaIncluido) {
  const total = redondear(items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.costo) || 0), 0));
  if (ivaIncluido) return { total, iva: redondear(total - total / (1 + IVA)), totalConIva: total };
  const iva = redondear(total * IVA);
  return { total, iva, totalConIva: redondear(total + iva) };
}

// ---------------------------------------------------------------------------
// Pedidos (órdenes de venta)
// ---------------------------------------------------------------------------
export async function crearPedido(datos) {
  const id = uid();
  return runTransaction(db, async (tx) => {
    const c = await tx.get(CONTADORES_DOC);
    const folio = (c.exists() ? Number(c.data().pedido) || 0 : 0) + 1;
    tx.set(CONTADORES_DOC, { pedido: folio }, { merge: true });
    tx.set(registroDoc("pedido", id), { ...datos, id, tipo: "pedido", folio, estado: "pendiente", createdAt: Date.now() });
    return folio;
  });
}

// Confirma un pedido: descuenta piezas (registradas como ventas), descuenta el
// embalaje que se usa por pedido y registra ese embalaje como gasto.
export async function confirmarPedido(pedido) {
  const pedidoRef = registroDoc("pedido", pedido.id);
  const qtyPorProducto = {};
  (pedido.items || []).forEach((i) => { qtyPorProducto[i.id] = (qtyPorProducto[i.id] || 0) + (Number(i.qty) || 0); });
  const ids = Object.keys(qtyPorProducto);

  return runTransaction(db, async (tx) => {
    const snapPedido = await tx.get(pedidoRef);
    if (!snapPedido.exists()) throw new Error("El pedido ya no existe.");
    if (snapPedido.data().estado !== "pendiente") throw new Error("Este pedido ya fue atendido.");
    const snaps = await Promise.all(ids.map((id) => tx.get(doc(db, "products", id))));
    const snapEmb = await tx.get(EMBALAJE_DOC);

    const ahora = Date.now();
    const faltantes = [];
    const productos = snaps.map((s, k) => {
      if (!s.exists()) { faltantes.push(`«${pedido.items.find((i) => i.id === ids[k])?.nombre || "Producto"}» ya no existe`); return null; }
      const p = normalizarProducto(s.data());
      if (qtyPorProducto[ids[k]] > p.cantidad) faltantes.push(`«${p.nombre}»: pide ${qtyPorProducto[ids[k]]}, hay ${p.cantidad}`);
      return p;
    });
    if (faltantes.length) throw new Error(`No hay piezas suficientes. ${faltantes.join(" · ")}`);

    let costoProductos = 0;
    productos.forEach((p, k) => {
      const id = ids[k];
      const ventas = [...p.ventas];
      (pedido.items || []).filter((i) => i.id === id).forEach((i) => {
        ventas.push({ id: uid(), at: ahora, qty: Number(i.qty) || 0, precio: Number(i.precio) || 0, costo: Number(p.precioCompra) || 0, pedido: pedido.folio });
        costoProductos += (Number(p.precioCompra) || 0) * (Number(i.qty) || 0);
      });
      const restante = p.cantidad - qtyPorProducto[id];
      tx.set(doc(db, "products", id), { ...p, cantidad: restante, disponible: restante > 0, vendidaAt: restante > 0 ? null : ahora, ventas });
    });

    // Embalaje que se usa en cada pedido
    const lista = snapEmb.exists() && Array.isArray(snapEmb.data().lista) ? snapEmb.data().lista : [];
    let costoEmbalaje = 0;
    const usado = [];
    const nuevaLista = lista.map((m) => {
      const porPedido = Math.max(0, Number(m.porPedido) || 0);
      const stock = Math.max(0, Number(m.stock) || 0);
      const uso = Math.min(porPedido, stock);
      if (uso <= 0) return m;
      costoEmbalaje += uso * (Number(m.costo) || 0);
      usado.push({ nombre: m.nombre, qty: uso });
      return { ...m, stock: stock - uso };
    });
    costoEmbalaje = redondear(costoEmbalaje);
    if (usado.length) tx.set(EMBALAJE_DOC, { lista: nuevaLista }, { merge: true });
    if (costoEmbalaje > 0) {
      tx.set(registroDoc("gasto", `${pedido.id}-embalaje`), {
        tipo: "gasto", id: `${pedido.id}-embalaje`, concepto: "embalaje", fecha: hoyStr(), monto: costoEmbalaje,
        descripcion: `Embalaje del pedido ${formatoFolio("PV", pedido.folio)} (${usado.map((u) => `${u.qty} ${u.nombre}`).join(", ")})`,
        origen: "pedido", refId: pedido.id, createdAt: ahora,
      });
    }
    tx.set(pedidoRef, { estado: "confirmado", confirmadoAt: ahora, costoProductos: redondear(costoProductos), costoEmbalaje, embalajeUsado: usado }, { merge: true });
  });
}

export const cancelarPedido = (pedido) => setDoc(registroDoc("pedido", pedido.id), { estado: "cancelado", canceladoAt: Date.now() }, { merge: true });

// ---------------------------------------------------------------------------
// Órdenes de compra
// ---------------------------------------------------------------------------
// Guarda la orden (asigna folio la primera vez). Con `recibir`, además suma las
// piezas al catálogo (o crea los artículos nuevos) y registra el envío como gasto.
export async function guardarOrdenCompra(oc, { recibir = false } = {}) {
  const id = oc.id || uid();
  const ref = registroDoc("oc", id);
  const items = (oc.items || [])
    .map((i) => ({ ...i, articulo: (i.articulo || "").trim(), cantidad: Math.max(0, Math.floor(Number(i.cantidad) || 0)), costo: redondear(i.costo), precio: redondear(i.precio) }))
    .filter((i) => i.articulo && i.cantidad > 0);
  if (!items.length) throw new Error("Agrega al menos un artículo con cantidad.");
  const totales = totalesOC(items, oc.ivaIncluido);
  const factorIva = oc.ivaIncluido ? 1 : 1 + IVA;
  const ids = [...new Set(items.filter((i) => i.productoId).map((i) => i.productoId))];

  return runTransaction(db, async (tx) => {
    const snapActual = await tx.get(ref);
    if (snapActual.exists() && snapActual.data().estado === "recibida") throw new Error("Esta orden ya fue recibida.");
    const snapCont = snapActual.exists() ? null : await tx.get(CONTADORES_DOC);
    const snaps = recibir ? await Promise.all(ids.map((pid) => tx.get(doc(db, "products", pid)))) : [];

    const folio = snapActual.exists() ? snapActual.data().folio : (snapCont.exists() ? Number(snapCont.data().oc) || 0 : 0) + 1;
    if (!snapActual.exists()) tx.set(CONTADORES_DOC, { oc: folio }, { merge: true });

    const ahora = Date.now();
    const registro = {
      ...oc, id, tipo: "oc", folio, items, ...totales,
      costoEnvio: oc.envioGratis ? 0 : redondear(oc.costoEnvio),
      estado: recibir ? "recibida" : "pendiente",
      createdAt: oc.createdAt || ahora, actualizado: ahora,
    };
    if (recibir) registro.recibidaAt = ahora;

    if (recibir) {
      const fechaCompra = oc.fechaRecepcion || hoyStr();
      const existentes = {};
      snaps.forEach((s, k) => { if (s.exists()) existentes[ids[k]] = normalizarProducto(s.data()); });

      // Artículos ya en el catálogo: se suman las piezas y se promedia el costo.
      const nuevos = [];
      items.forEach((i) => {
        const costoUnit = redondear(i.costo * factorIva);
        const p = i.productoId && existentes[i.productoId];
        if (!p) { nuevos.push({ ...i, costoUnit }); return; }
        const stockAnt = Math.max(0, p.cantidad);
        const stock = stockAnt + i.cantidad;
        const costoAnt = Number(p.precioCompra) || 0;
        existentes[i.productoId] = {
          ...p,
          cantidad: stock,
          disponible: true,
          vendidaAt: null,
          precioCompra: stockAnt > 0 && costoAnt > 0 ? redondear((stockAnt * costoAnt + i.cantidad * costoUnit) / stock) : costoUnit,
          precioVenta: i.precio > 0 ? i.precio : p.precioVenta,
          proveedor: oc.proveedor || p.proveedor || "",
          fechaCompra,
        };
      });
      Object.entries(existentes).forEach(([pid, p]) => tx.set(doc(db, "products", pid), p));

      nuevos.forEach((i, k) => {
        const pid = uid() + k;
        tx.set(doc(db, "products", pid), {
          ...EMPTY_PRODUCT,
          nombre: i.articulo,
          categoria: oc.categoriaNuevos || "",
          precioVenta: i.precio,
          precioCompra: i.costoUnit,
          cantidad: i.cantidad,
          disponible: true,
          proveedor: oc.proveedor || "",
          fechaCompra,
          ventas: [],
          createdAt: ahora + k,
        });
      });

      if (registro.costoEnvio > 0) {
        tx.set(registroDoc("gasto", `${id}-envio`), {
          tipo: "gasto", id: `${id}-envio`, concepto: "envio", fecha: fechaCompra, monto: registro.costoEnvio,
          descripcion: `Envío de la ${formatoFolio("OC", folio)}${oc.proveedor ? ` · ${oc.proveedor}` : ""}`,
          origen: "oc", refId: id, createdAt: ahora,
        });
      }
    }
    tx.set(ref, registro);
    return { id, folio };
  });
}

export const eliminarOrdenCompra = (oc) => deleteDoc(registroDoc("oc", oc.id));

// ---------------------------------------------------------------------------
// Gastos y embalaje
// ---------------------------------------------------------------------------
export function guardarGasto(g) {
  const id = g.id || uid();
  return setDoc(registroDoc("gasto", id), {
    tipo: "gasto", id, concepto: g.concepto || "otro", fecha: g.fecha || hoyStr(),
    descripcion: (g.descripcion || "").trim(), monto: redondear(g.monto), origen: g.origen || "manual",
    createdAt: g.createdAt || Date.now(),
  });
}
export const eliminarGasto = (g) => deleteDoc(registroDoc("gasto", g.id));
export const guardarEmbalaje = (lista) => setDoc(EMBALAJE_DOC, { lista }, { merge: true });
export const guardarColonias = (lista) => setDoc(COLONIAS_DOC, { lista, actualizado: Date.now() });

// ---------------------------------------------------------------------------
// Catálogo de colonias de Cuautitlán Izcalli (precargado; editable en el Dashboard).
// Fuente: listado de asentamientos del municipio (micodigopostal.org).
// ---------------------------------------------------------------------------
const NOMBRES_IZCALLI = [
  "Adolfo López Mateos", "Ampliación Ejidal San Isidro", "Arboledas de San Miguel", "Arcos de la Hacienda", "Arcos del Alba",
  "Atlanta", "Axotlán", "Bellavista", "Bosques de la Hacienda 1a Sección", "Bosques de la Hacienda 2a Sección",
  "Bosques de la Hacienda 3a Sección", "Bosques de Morelos", "Bosques de Xhala", "Bosques del Alba I", "Bosques del Alba II",
  "Bosques del Lago", "Bosques del Perinorte", "Campestre del Lago", "Campo 1", "Claustros de San Miguel",
  "Cofradía de San Miguel", "Cofradía II", "Cofradía III", "Cofradía IV", "Colinas del Lago", "Colonial Taxco",
  "Complejo Industrial Cuamatla", "CTM NR1 Núcleos", "Cuautitlán Izcalli Centro Urbano", "Cumbre Norte", "Cumbria",
  "Del Río", "Ejidal San Isidro", "Ejido de Guadalupe", "Ejido Santa María Tianguistengo", "Ejido Santiago Cuautlalpan",
  "Ejidos de San Isidro", "El Cerrito (unidad habitacional)", "El Cerrito (colonia)", "El Rosario", "El Sabino", "El Socorro",
  "El Tikal", "Elite Plaza", "Ensueños", "Ex-Hacienda San Miguel", "Ferrocarrilera", "Fidel Velázquez", "Francisco Villa",
  "Fuentes del Bosque", "Fuentes del Tepeyac", "Generalísimo José María Morelos y Pavón Sección Norte",
  "Generalísimo José María Morelos y Pavón Sección Sur", "Granjas Lomas de Guadalupe", "Hacienda del Parque",
  "INFONAVIT Centro", "INFONAVIT Norte", "INFONAVIT Norte Consorcio", "INFONAVIT Sur \"Niños Héroes\"", "INFONAVIT Tepalcapa",
  "Jardines de la Hacienda Norte", "Jardines de la Hacienda Sur", "Jardines de San Miguel", "Jardines de San Miguel III",
  "Jardines del Alba", "Jorge Jiménez Cantú", "Joyas del Alba", "La Aurora", "La Conasupo", "La Era", "La Joyita", "La Perla",
  "La Piedad (colonia)", "La Piedad (unidad habitacional)", "La Presita", "La Quebrada Ampliación", "La Quebrada Centro",
  "Lago de Guadalupe", "Las Ánimas", "Las Auroritas", "Las Conchitas", "Las Gaviotas", "Las Huertas", "Las Mariposas",
  "Las Tinajas", "Loma Bonita", "Lomas de los Ángeles", "Lomas de San Francisco Tepojaco", "Lomas del Bosque", "Los Ailes",
  "Los Pájaros", "Los Pinos", "Luis Echeverría", "México", "Mirador Santa Rosa", "Nopaltepec", "Parque Industrial Cuamatla",
  "Parque Industrial La Joya", "Parque Industrial La Luz", "Parque Industrial San Martín Obispo", "Parque Industrial Xhala",
  "Paseo de los Jardines", "Paseos de Izcalli", "Paseos del Encanto", "Plan de Guadalupe", "Plaza Dorada",
  "Prados de Cuautitlán", "Residencial Bosques del Alba", "Residencial La Joya", "Residencial La Luz", "Residencial Los Lirios",
  "Rincón Colonial", "Rincón del Bosque", "Rinconada Cuautitlán", "Rinconada San Miguel", "San Antonio",
  "San Francisco Tepojaco", "San Isidro", "San José Buenavista", "San José Huilango", "San Juan Atlamica",
  "San Lorenzo Río Tenco", "San Marcos Cuamatla", "San Martín Obispo o Tepetlixpan", "San Martín Tepetlixpan",
  "San Mateo Ixtacalco", "San Mateo Ixtacalco Fracción La Capilla", "San Pablo de los Gallos", "San Sebastián Xhala",
  "Santa Bárbara", "Santa María de Guadalupe La Quebrada", "Santa María Guadalupe Las Torres", "Santa María Tianguistengo",
  "Santa Rosa de Lima", "Santiago Tepalcapa", "Sección Parques", "Torres Algibe", "Tres de Mayo", "Tres Picos", "Tulipanes",
];
export const COLONIAS_IZCALLI = NOMBRES_IZCALLI.map((colonia, i) => ({
  id: `ci-${String(i + 1).padStart(3, "0")}`, colonia, municipio: "Cuautitlán Izcalli", envio: null, peligro: false,
}));
