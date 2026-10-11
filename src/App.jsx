import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Search, Plus, Trash2, Pencil, Download, Lock, Unlock,
  ShoppingBag, LayoutDashboard, Settings, ImageOff,
  Package, DollarSign, Send, Check, Info,
  Filter, Calendar, Clock, Truck, Tag, BarChart3, ShieldCheck, RotateCcw,
  Eye, EyeOff, Minus, Undo2, ChevronDown, ChevronUp, Tags, ImagePlus, AlertTriangle, FileUp,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, getDocs, getDoc, writeBatch, runTransaction, deleteField,
} from "firebase/firestore";
import { db } from "./firebase";
import { TEXTOS_BASE, ETIQUETAS, SECCIONES, rellenar, variablesDe, claveAFirestore, claveDeFirestore } from "./textos";
import { Modal, Field, inputCls, inputStyle, varsColores } from "./ui";
import ImageEditor, { TAMANOS_PRODUCTO, urlADataUrl } from "./ImageEditor";
import {
  EdicionCtx, useEdicion, T, Editable, EditBadge, BotonFoto, EditorCampo, BarraEdicion,
  TextosPanel, CategoriasPanel, DisenoPanel, TamanoLogo,
} from "./edicion";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const EMPTY_PRODUCT = {
  nombre: "", categoria: "", subcategoria: "", color: "", talla: "",
  material: "", genero: "", grupo: "", precioVenta: "", precioCompra: "", cantidad: 1,
  ubicacion: "", imagen: null, disponible: true, oculto: false,
  fechaCompra: "", proveedor: "", vendidaAt: null, ventas: [],
};

const PRODUCTS_COL = collection(db, "products");
const SETTINGS_COL = collection(db, "settings");
const SETTINGS_DOC = doc(db, "settings", "store");
const CATEGORIAS_DOC = doc(db, "settings", "categorias");
const TEXTOS_DOC = doc(db, "settings", "textos");
const IMAGEN_DOC = { logo: doc(db, "settings", "img_logo"), portada: doc(db, "settings", "img_portada") };
// Foto original (sin recortar) de un producto, del logo o de la portada: se carga solo al editar.
const originalDoc = (clave) => doc(db, "settings", `foto_original_${clave}`);
const PAQUETES_URL = "/importar/index.json";

const DEFAULT_SETTINGS = {
  nombre: "Boutique Martita", tagline: "Bazar de ropa bonita", whatsapp: "", pin: "1234",
  fotoAspecto: "3:4", tarjetaTam: "normal", logoTam: 44,
};
const CAMPO_TIENDA = { "tienda.nombre": "nombre", "tienda.tagline": "tagline" };

const GRID_TARJETAS = {
  chico: "grid grid-cols-3 md:grid-cols-4 gap-2.5",
  normal: "grid grid-cols-2 md:grid-cols-3 gap-4",
  grande: "grid grid-cols-1 sm:grid-cols-2 gap-4",
};

// ---------------------------------------------------------------------------
// Caché local de textos y diseño (evita parpadeos al abrir la página)
// ---------------------------------------------------------------------------
const CACHE_KEY = "bm-contenido-v1";
function leerCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
}
function escribirCache(datos) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(datos)); } catch { /* sin espacio o modo privado */ }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function money(n) {
  const v = Number(n) || 0;
  const dec = Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2;
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: dec, maximumFractionDigits: dec });
}

const DAY_MS = 86400000;

// Convierte "YYYY-MM-DD" a timestamp local (mediodía, para evitar saltos de zona horaria)
function dateStrToTs(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

function tsToDateStr(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Inventario por piezas: `cantidad` es el stock actual y `ventas` el historial.
// Los productos guardados con la versión anterior (Disponible/Vendida) se leen así:
// - Vendida  → stock 0 y una venta con su fecha (se puede deshacer con el PIN).
// - Disponible → stock = cantidad registrada.
function normalizarProducto(p) {
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

const piezasVendidas = (p) => (p.ventas || []).reduce((s, v) => s + (Number(v.qty) || 0), 0);
const ultimaVenta = (p) => (p.ventas || []).reduce((u, v) => (!u || v.at > u.at ? v : u), null);

// Días que la pieza lleva (o llevó) en inventario
function diasEnInventario(p) {
  const inicio = dateStrToTs(p.fechaCompra) || p.createdAt;
  if (!inicio) return null;
  const fin = Number(p.cantidad) <= 0 ? (p.vendidaAt || ultimaVenta(p)?.at || Date.now()) : Date.now();
  return Math.max(0, Math.floor((fin - inicio) / DAY_MS));
}

function ventasPlanas(products) {
  return products.flatMap((p) => (p.ventas || []).map((v) => ({
    ...v, qty: Number(v.qty) || 0, precio: Number(v.precio) || 0, costo: Number(v.costo) || 0,
    productoId: p.id, nombre: p.nombre, categoria: p.categoria, grupo: p.grupo,
  })));
}

const aspectoCss = (a) => (a || "3:4").replace(":", " / ");
const detalleDe = (p) => [p.talla, p.color].filter(Boolean).join(" · ");

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------------------------------------------------------------------
// Fuentes / estilos de marca
// ---------------------------------------------------------------------------
const BrandStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Work+Sans:wght@400;500;600;700&display=swap');
    .font-display { font-family: 'Cormorant Garamond', serif; }
    .font-body { font-family: 'Work Sans', sans-serif; }
    .scrollbar-none::-webkit-scrollbar { display: none; }
    .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
  `}</style>
);

// ---------------------------------------------------------------------------
// Ícono de mariposa (logo)
// ---------------------------------------------------------------------------
function ButterflyIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 15 C22.5 10.5, 19.5 8, 16.5 8.5" stroke="#2B2320" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M24 15 C25.5 10.5, 28.5 8, 31.5 8.5" stroke="#2B2320" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M23 16 C14 9, 4 13, 6 23 C7 29, 15 29, 23 23 Z" stroke="#2B2320" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
      <path d="M23 25 C15 23, 8 27, 10 34 C11 39, 18 38, 23 32 Z" stroke="#2B2320" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
      <path d="M25 16 C34 9, 44 13, 42 23 C41 29, 33 29, 25 23 Z" style={{ fill: "var(--colorAcento)" }} opacity="0.9" />
      <path d="M25 25 C33 23, 40 27, 38 34 C37 39, 30 38, 25 32 Z" style={{ fill: "var(--colorAcento)" }} opacity="0.7" />
      <ellipse cx="24" cy="24" rx="1.5" ry="10" fill="#2B2320" />
    </svg>
  );
}

function Logo({ src, tam = 44 }) {
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ width: tam, height: tam, background: "#EFE2DE" }}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <ButterflyIcon size={Math.round(tam * 0.55)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function App() {
  const [cache] = useState(leerCache);

  const [productsRaw, setProductsRaw] = useState([]);
  const products = useMemo(() => productsRaw.map(normalizarProducto), [productsRaw]);
  const [loading, setLoading] = useState(true);
  const [connError, setConnError] = useState(false);

  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...(cache.settings || {}) }));
  const [categorias, setCategorias] = useState(() => cache.categorias || []);
  const [textos, setTextos] = useState(() => cache.textos || {});
  const [imagenes, setImagenes] = useState(() => ({ logo: cache.logo || null, portada: cache.portada || null }));

  const [mode, setMode] = useState("cliente"); // cliente | admin
  const [editando, setEditando] = useState(false);
  const [pinModal, setPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState("Todas");

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  const [ventaTarget, setVentaTarget] = useState(null);
  const [deshacer, setDeshacer] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [formImage, setFormImage] = useState(null);
  const [formFoto, setFormFoto] = useState({ original: null, recorte: undefined });
  const [saving, setSaving] = useState(false);

  const [editorCampo, setEditorCampo] = useState(null);
  const [editorImagen, setEditorImagen] = useState(null);
  const [panel, setPanel] = useState(null); // textos | categorias | diseno
  const [aviso, setAviso] = useState(null);

  const isAdmin = mode === "admin" || editando;

  // -------------------------------------------------------------------
  // Suscripción en tiempo real a Firestore
  // -------------------------------------------------------------------
  useEffect(() => {
    const unsubs = [
      onSnapshot(
        PRODUCTS_COL,
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setProductsRaw(list);
          setLoading(false);
          setConnError(false);
        },
        () => { setConnError(true); setLoading(false); }
      ),
      onSnapshot(SETTINGS_DOC, (snap) => { if (snap.exists()) setSettings((s) => ({ ...s, ...snap.data() })); }, () => { /* valores por defecto */ }),
      onSnapshot(CATEGORIAS_DOC, (snap) => {
        const lista = snap.exists() ? snap.data().lista : null;
        setCategorias(Array.isArray(lista) ? lista : []);
      }, () => {}),
      onSnapshot(TEXTOS_DOC, (snap) => {
        const datos = snap.exists() ? snap.data() : {};
        setTextos(Object.fromEntries(Object.entries(datos).map(([k, v]) => [claveDeFirestore(k), v])));
      }, () => {}),
      ...Object.entries(IMAGEN_DOC).map(([clave, ref]) => onSnapshot(ref, (snap) => {
        setImagenes((i) => ({ ...i, [clave]: snap.exists() && snap.data().src ? snap.data() : null }));
      }, () => {})),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // Guarda en el dispositivo lo necesario para pintar la tienda al instante (sin el PIN).
  useEffect(() => {
    const { pin, ...visibles } = settings; // eslint-disable-line no-unused-vars
    const chica = (img) => (img && (img.src || "").length < 300000 ? img : null);
    escribirCache({ settings: visibles, categorias, textos, logo: chica(imagenes.logo), portada: chica(imagenes.portada) });
  }, [settings, categorias, textos, imagenes]);

  // -------------------------------------------------------------------
  // Textos editables
  // -------------------------------------------------------------------
  const valorCrudo = useCallback((k) => {
    const campo = CAMPO_TIENDA[k];
    if (campo) return settings[campo] ?? "";
    return textos[k] ?? TEXTOS_BASE[k] ?? k;
  }, [textos, settings]);

  const t = useCallback((k, vars) => rellenar(valorCrudo(k), vars), [valorCrudo]);

  const esModificado = useCallback((k) => (CAMPO_TIENDA[k]
    ? valorCrudo(k) !== TEXTOS_BASE[k]
    : Object.prototype.hasOwnProperty.call(textos, k)), [textos, valorCrudo]);

  const avisar = useCallback((texto, tipo = "ok") => setAviso({ texto, tipo, id: Date.now() }), []);
  useEffect(() => {
    if (!aviso) return undefined;
    const tm = setTimeout(() => setAviso(null), 2600);
    return () => clearTimeout(tm);
  }, [aviso]);

  const guardarTexto = useCallback(async (k, v) => {
    const campo = CAMPO_TIENDA[k];
    if (campo) {
      setSettings((s) => ({ ...s, [campo]: v }));
      await setDoc(SETTINGS_DOC, { [campo]: v }, { merge: true });
    } else {
      setTextos((tx) => ({ ...tx, [k]: v }));
      await setDoc(TEXTOS_DOC, { [claveAFirestore(k)]: v }, { merge: true });
    }
  }, []);

  const restaurarTexto = useCallback(async (k) => {
    if (CAMPO_TIENDA[k]) return guardarTexto(k, TEXTOS_BASE[k]);
    setTextos((tx) => { const n = { ...tx }; delete n[k]; return n; });
    await setDoc(TEXTOS_DOC, { [claveAFirestore(k)]: deleteField() }, { merge: true });
    return undefined;
  }, [guardarTexto]);

  const editarTexto = useCallback((k) => {
    const base = TEXTOS_BASE[k] || "";
    const seccion = SECCIONES.find(([id]) => id === k.split(".")[0]);
    setEditorCampo({
      titulo: ETIQUETAS[k] || k,
      seccion: seccion ? seccion[1] : "",
      valor: valorCrudo(k),
      original: base,
      multilinea: base.length > 48 || base.includes("\n"),
      variables: variablesDe(k),
      modificado: esModificado(k),
      onGuardar: async (v) => { await guardarTexto(k, v); avisar(t("general.guardado")); },
      onRestaurar: async () => { await restaurarTexto(k); avisar(t("general.guardado")); },
    });
  }, [valorCrudo, esModificado, guardarTexto, restaurarTexto, avisar, t]);

  const ctx = useMemo(() => ({ editando, t, editarTexto }), [editando, t, editarTexto]);

  // Título de la pestaña y descripción editables.
  useEffect(() => {
    document.title = t("sitio.titulo", { tienda: settings.nombre });
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", t("sitio.descripcion", { tienda: settings.nombre }));
  }, [t, settings.nombre]);

  const saveSettings = async (next) => {
    try { await setDoc(SETTINGS_DOC, next, { merge: true }); }
    catch { /* best effort */ }
  };

  const guardarAjuste = useCallback(async (campo, valor) => {
    setSettings((s) => ({ ...s, [campo]: valor }));
    try { await setDoc(SETTINGS_DOC, { [campo]: valor }, { merge: true }); }
    catch { avisar(t("general.errorGuardar"), "error"); }
  }, [avisar, t]);

  // -------------------------------------------------------------------
  // Categorías
  // -------------------------------------------------------------------
  const guardarCategorias = async (lista) => {
    setCategorias(lista);
    await setDoc(CATEGORIAS_DOC, { lista }, { merge: true });
  };

  const actualizarProductosEnLote = async (lista, cambios) => {
    for (let i = 0; i < lista.length; i += 400) {
      const batch = writeBatch(db);
      lista.slice(i, i + 400).forEach((p) => batch.set(doc(db, "products", p.id), cambios, { merge: true }));
      await batch.commit();
    }
  };

  const agregarCategoria = async (nombre) => {
    const limpio = (nombre || "").trim();
    if (!limpio) throw new Error("Escribe un nombre.");
    const existente = categorias.find((c) => c.toLowerCase() === limpio.toLowerCase());
    if (existente) throw new Error(t("cat.existe"));
    await guardarCategorias([...categorias, limpio]);
    return limpio;
  };

  const renombrarCategoria = async (anterior, nuevo) => {
    const limpio = (nuevo || "").trim();
    if (!limpio) throw new Error("Escribe un nombre.");
    if (limpio === anterior) return;
    if (categorias.some((c) => c !== anterior && c.toLowerCase() === limpio.toLowerCase())) throw new Error(t("cat.existe"));
    await guardarCategorias(categorias.map((c) => (c === anterior ? limpio : c)));
    await actualizarProductosEnLote(productsRaw.filter((p) => p.categoria === anterior), { categoria: limpio });
    if (activeCat === anterior) setActiveCat(limpio);
  };

  const eliminarCategoria = async (nombre) => {
    await guardarCategorias(categorias.filter((c) => c !== nombre));
    await actualizarProductosEnLote(productsRaw.filter((p) => p.categoria === nombre), { categoria: "" });
    if (activeCat === nombre) setActiveCat("Todas");
  };

  const moverCategoria = async (nombre, dir) => {
    const i = categorias.indexOf(nombre);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= categorias.length) return;
    const lista = [...categorias];
    [lista[i], lista[j]] = [lista[j], lista[i]];
    await guardarCategorias(lista);
  };

  const conteoCategorias = useMemo(() => {
    const c = {};
    products.forEach((p) => { if (p.categoria) c[p.categoria] = (c[p.categoria] || 0) + 1; });
    return c;
  }, [products]);

  useEffect(() => {
    if (activeCat !== "Todas" && !loading && !categorias.includes(activeCat)) setActiveCat("Todas");
  }, [categorias, activeCat, loading]);

  const editarCategoriaChip = (nombre) => setEditorCampo({
    titulo: "Categoría",
    seccion: t("cat.productos", { n: conteoCategorias[nombre] || 0 }),
    valor: nombre,
    requerido: true,
    onGuardar: async (v) => { await renombrarCategoria(nombre, v); avisar(t("general.guardado")); },
    acciones: [
      {
        etiqueta: "Eliminar categoría", peligro: true, icono: <Trash2 size={12} />,
        onClick: async () => {
          if (!window.confirm(t("cat.confirmarEliminar", { nombre, n: conteoCategorias[nombre] || 0 }))) return false;
          await eliminarCategoria(nombre);
          return true;
        },
      },
      { etiqueta: "Ordenar categorías", icono: <Tags size={12} />, onClick: () => setPanel("categorias") },
    ],
  });

  const nuevaCategoriaChip = () => setEditorCampo({
    titulo: "Nueva categoría", valor: "", requerido: true,
    onGuardar: async (v) => { await agregarCategoria(v); avisar(t("general.guardado")); },
  });

  // -------------------------------------------------------------------
  // Productos: escritura
  // -------------------------------------------------------------------
  const actualizarProducto = (id, cambios) => setDoc(doc(db, "products", id), cambios, { merge: true });

  const editarCampoProducto = (p, campo) => {
    const defs = {
      nombre: { titulo: "Nombre del producto", requerido: true },
      precioVenta: { titulo: "Precio de venta", tipo: "numero" },
      categoria: {
        titulo: "Categoría",
        tipo: "opciones",
        opciones: [...categorias.map((c) => ({ valor: c, etiqueta: c })), { valor: "", etiqueta: t("dash.sinCategoria") }],
        acciones: [{ etiqueta: "Administrar categorías", icono: <Tags size={12} />, onClick: () => setPanel("categorias") }],
      },
    };
    setEditorCampo({
      ...defs[campo],
      seccion: p.nombre,
      valor: p[campo] ?? "",
      onGuardar: async (v) => { await actualizarProducto(p.id, { [campo]: v }); avisar(t("general.guardado")); },
    });
  };

  const cargarOriginalDe = (clave) => async () => {
    const snap = await getDoc(originalDoc(clave));
    return snap.exists() ? snap.data().src || null : null;
  };

  const editarFotoProducto = (p) => setEditorImagen({
    titulo: p.nombre || "Foto del producto",
    src: p.imagen || null,
    cargarOriginal: cargarOriginalDe(p.id),
    recorteInicial: p.recorte || null,
    aspecto: settings.fotoAspecto || "3:4",
    tamanos: TAMANOS_PRODUCTO,
    ayuda: `El recuadro usa el formato del catálogo (${settings.fotoAspecto || "3:4"}); cámbialo en «Diseño e imágenes».`,
    onGuardar: async ({ imagen, original, recorte }) => {
      if (original) await setDoc(originalDoc(p.id), { src: original, productoId: p.id, actualizado: Date.now() });
      await actualizarProducto(p.id, { imagen, recorte: recorte || null });
      setEditorImagen(null);
      avisar(t("general.guardado"));
    },
    onQuitar: p.imagen ? async () => {
      await actualizarProducto(p.id, { imagen: null, recorte: null });
      await deleteDoc(originalDoc(p.id)).catch(() => {});
      setEditorImagen(null);
      avisar(t("general.guardado"));
    } : undefined,
  });

  const guardarImagenSitio = (clave) => async ({ imagen, original, recorte }) => {
    if (original) await setDoc(originalDoc(clave), { src: original, actualizado: Date.now() });
    await setDoc(IMAGEN_DOC[clave], { src: imagen, recorte: recorte || null, actualizado: Date.now() });
    setEditorImagen(null);
    avisar(t("general.guardado"));
  };

  const quitarImagenSitio = (clave) => async () => {
    await deleteDoc(IMAGEN_DOC[clave]);
    await deleteDoc(originalDoc(clave)).catch(() => {});
    setImagenes((i) => ({ ...i, [clave]: null }));
    setEditorImagen(null);
    avisar(t("general.guardado"));
  };

  const editarLogo = () => setEditorImagen({
    titulo: "Logo",
    src: imagenes.logo?.src || null,
    cargarOriginal: cargarOriginalDe("logo"),
    recorteInicial: imagenes.logo?.recorte || null,
    aspecto: "1:1",
    redondo: true,
    png: true,
    tamanos: [{ etiqueta: "Normal", lado: 256 }, { etiqueta: "Alta", lado: 512 }],
    tamanoInicial: 1,
    extra: <TamanoLogo valor={settings.logoTam || 44} onCambiar={(n) => guardarAjuste("logoTam", n)} />,
    onGuardar: guardarImagenSitio("logo"),
    onQuitar: imagenes.logo ? quitarImagenSitio("logo") : undefined,
  });

  const editarPortada = () => setEditorImagen({
    titulo: "Imagen de portada",
    src: imagenes.portada?.src || null,
    cargarOriginal: cargarOriginalDe("portada"),
    recorteInicial: imagenes.portada?.recorte || null,
    aspecto: "16:9",
    opcionesAspecto: ["16:9", "3:1", "4:3", "1:1", "original"],
    tamanos: [{ etiqueta: "Normal", lado: 1200 }, { etiqueta: "Alta", lado: 1600 }],
    tamanoInicial: 0,
    onGuardar: guardarImagenSitio("portada"),
    onQuitar: imagenes.portada ? quitarImagenSitio("portada") : undefined,
  });

  // -------------------------------------------------------------------
  // Filtro inteligente (tienda)
  // -------------------------------------------------------------------
  const visibles = useMemo(() => products.filter((p) => !p.oculto && p.cantidad > 0), [products]);

  const filtered = useMemo(() => {
    const terms = query.toLowerCase().split(/[\s+]+/).filter(Boolean);
    return visibles.filter((p) => {
      if (activeCat !== "Todas" && p.categoria !== activeCat) return false;
      if (terms.length === 0) return true;
      const hay = [p.nombre, p.categoria, p.subcategoria, p.color, p.talla, p.material, p.genero]
        .join(" ").toLowerCase();
      return terms.every((term) => hay.includes(term));
    });
  }, [visibles, query, activeCat]);

  // -------------------------------------------------------------------
  // Carrito (no permite pedir más piezas de las que hay)
  // -------------------------------------------------------------------
  const addToCart = (product) => {
    const enCarrito = cart.find((i) => i.id === product.id)?.qty || 0;
    if (enCarrito >= product.cantidad) {
      avisar(t("tarjeta.limite", { n: product.cantidad }), "error");
      return false;
    }
    setCart((c) => {
      const existing = c.find((i) => i.id === product.id);
      if (existing) return c.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
      return [...c, { id: product.id, nombre: product.nombre, detalle: detalleDe(product), precioVenta: product.precioVenta, qty: 1 }];
    });
    return true;
  };
  const updateQty = (id, delta) => {
    if (delta > 0) {
      const p = products.find((x) => x.id === id);
      const item = cart.find((i) => i.id === id);
      if (p && item && item.qty + delta > p.cantidad) { avisar(t("tarjeta.limite", { n: p.cantidad }), "error"); return; }
    }
    setCart((c) => c
      .map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i))
      .filter((i) => i.qty > 0));
  };
  const cartTotal = cart.reduce((s, i) => s + (Number(i.precioVenta) || 0) * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const articulosTxt = (n) => t(n === 1 ? "pedido.articulo" : "pedido.articulos", { n });

  const sendOrderWhatsApp = () => {
    const lineas = cart.map((i) => t("pedido.linea", {
      cantidad: i.qty, nombre: i.nombre, detalle: i.detalle ? ` (${i.detalle})` : "", subtotal: money(i.precioVenta * i.qty),
    }));
    const text = t("pedido.mensaje", { tienda: settings.nombre, lineas: lineas.join("\n"), total: money(cartTotal), articulos: articulosTxt(cartCount) });
    const phone = (settings.whatsapp || "").replace(/\D/g, "");
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  // -------------------------------------------------------------------
  // Admin: PIN y modo edición
  // -------------------------------------------------------------------
  const tryEnterAdmin = (conEdicion = false) => {
    if (pinInput !== settings.pin) { setPinError(t("acceso.error")); return; }
    setPinModal(false); setPinInput(""); setPinError("");
    if (conEdicion) { setEditando(true); setMode("cliente"); }
    else setMode("admin");
  };

  const entrarEdicion = () => { setEditando(true); setMode("cliente"); window.scrollTo({ top: 0 }); };
  const terminarEdicion = () => { setEditando(false); setPanel(null); setMode("admin"); };
  const salirAdmin = () => { setEditando(false); setPanel(null); setMode("cliente"); };

  // -------------------------------------------------------------------
  // Admin: formulario de producto
  // -------------------------------------------------------------------
  const openNewForm = () => {
    setForm(EMPTY_PRODUCT); setFormImage(null); setFormFoto({ original: null, recorte: undefined });
    setEditingId(null); setFormOpen(true);
  };
  const openEditForm = (p) => {
    setForm({ ...EMPTY_PRODUCT, ...p }); setFormImage(p.imagen || null); setFormFoto({ original: null, recorte: undefined });
    setEditingId(p.id); setFormOpen(true);
  };
  const closeForm = () => setFormOpen(false);

  const editarFotoFormulario = () => {
    const productoGuardado = editingId ? products.find((p) => p.id === editingId) : null;
    setEditorImagen({
      titulo: form.nombre || t("form.foto"),
      src: formImage,
      cargarOriginal: formFoto.original
        ? async () => formFoto.original
        : (editingId ? cargarOriginalDe(editingId) : undefined),
      recorteInicial: formFoto.recorte !== undefined ? formFoto.recorte : (productoGuardado?.recorte || null),
      aspecto: settings.fotoAspecto || "3:4",
      tamanos: TAMANOS_PRODUCTO,
      onGuardar: async ({ imagen, original, recorte }) => {
        setFormImage(imagen);
        setFormFoto((f) => ({ original: original || f.original, recorte: recorte || null }));
        setEditorImagen(null);
      },
    });
  };

  const submitForm = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.categoria) return;
    setSaving(true);
    const id = editingId || uid();
    const actual = editingId ? products.find((p) => p.id === editingId) : null;
    const ventas = actual ? actual.ventas : [];
    const stock = Math.max(0, Math.floor(Number(form.cantidad) || 0));
    const { id: _omit, ...datos } = form; // eslint-disable-line no-unused-vars
    const record = {
      ...datos,
      precioVenta: Number(form.precioVenta) || 0,
      precioCompra: Number(form.precioCompra) || 0,
      cantidad: stock,
      disponible: stock > 0,
      oculto: Boolean(form.oculto),
      ventas,
      imagen: formImage || null,
      createdAt: form.createdAt || Date.now(),
      vendidaAt: stock > 0 ? null : (form.vendidaAt || (actual && ultimaVenta(actual)?.at) || null),
    };
    if (!formImage) record.recorte = null;
    else if (formFoto.recorte !== undefined) record.recorte = formFoto.recorte;
    try {
      if (formFoto.original) await setDoc(originalDoc(id), { src: formFoto.original, productoId: id, actualizado: Date.now() });
      else if (!formImage && editingId) await deleteDoc(originalDoc(id)).catch(() => {});
      await setDoc(doc(db, "products", id), record);
    } catch {
      setConnError(true);
    }
    setSaving(false);
    setFormOpen(false);
  };

  const deleteProduct = async (id) => {
    try {
      await deleteDoc(doc(db, "products", id));
      await deleteDoc(originalDoc(id)).catch(() => {});
    } catch { setConnError(true); }
  };

  const alternarOculto = async (p) => {
    try { await actualizarProducto(p.id, { oculto: !p.oculto }); }
    catch { avisar(t("general.errorGuardar"), "error"); }
  };

  // -------------------------------------------------------------------
  // Ventas por pieza (transacción: evita vender piezas que ya no hay)
  // -------------------------------------------------------------------
  const registrarVenta = async (id, qty, precio) => {
    const ref = doc(db, "products", id);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("El producto ya no existe.");
      const p = normalizarProducto({ ...snap.data() });
      if (qty < 1 || qty > p.cantidad) throw new Error(t("venta.sinStock"));
      const restante = p.cantidad - qty;
      const venta = { id: uid(), at: Date.now(), qty, precio, costo: Number(p.precioCompra) || 0 };
      tx.set(ref, {
        ...p,
        cantidad: restante,
        disponible: restante > 0,
        vendidaAt: restante > 0 ? null : venta.at,
        ventas: [...p.ventas, venta],
      });
    });
    avisar(t("venta.registrada"));
  };

  const deshacerVenta = async (productoId, ventaId) => {
    const ref = doc(db, "products", productoId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("El producto ya no existe.");
      const p = normalizarProducto({ ...snap.data() });
      const venta = p.ventas.find((v) => v.id === ventaId);
      if (!venta) return;
      tx.set(ref, {
        ...p,
        cantidad: p.cantidad + (Number(venta.qty) || 0),
        disponible: true,
        vendidaAt: null,
        ventas: p.ventas.filter((v) => v.id !== ventaId),
      });
    });
  };

  // -------------------------------------------------------------------
  // Excel
  // -------------------------------------------------------------------
  const exportExcel = () => {
    const rows = products.map((p) => {
      const ult = ultimaVenta(p);
      return {
        Nombre: p.nombre, Categoría: p.categoria, Subcategoría: p.subcategoria,
        Color: p.color, Talla: p.talla, Material: p.material, Género: p.genero, Grupo: p.grupo,
        "Piezas en stock": p.cantidad, "Piezas vendidas": piezasVendidas(p),
        "Precio compra": p.precioCompra, "Precio venta": p.precioVenta,
        "Valor inventario (costo)": (Number(p.precioCompra) || 0) * p.cantidad,
        "Valor inventario (venta)": (Number(p.precioVenta) || 0) * p.cantidad,
        Ubicación: p.ubicacion,
        Proveedor: p.proveedor,
        "Fecha de compra": p.fechaCompra || "",
        "Días en inventario": diasEnInventario(p) ?? "",
        Estado: p.oculto ? "Oculto" : p.cantidad > 0 ? "Disponible" : "Agotado",
        "Última venta": ult ? fmtDateTime(ult.at) : "",
      };
    });
    const ventas = ventasPlanas(products).sort((a, b) => b.at - a.at).map((v) => ({
      Fecha: fmtDateTime(v.at), Producto: v.nombre, Categoría: v.categoria, Piezas: v.qty,
      "Precio por pieza": v.precio, Total: v.precio * v.qty, "Costo por pieza": v.costo, Utilidad: (v.precio - v.costo) * v.qty,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Inventario");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ventas.length ? ventas : [{ Fecha: "", Producto: "" }]), "Ventas");
    XLSX.writeFile(wb, `inventario-${settings.nombre.replace(/\s+/g, "_")}.xlsx`);
  };

  // -------------------------------------------------------------------
  // Respaldo completo (lee directo de Firestore, incluye fotos, textos y categorías)
  // -------------------------------------------------------------------
  const exportBackup = async () => {
    const [snapP, snapS] = await Promise.all([getDocs(PRODUCTS_COL), getDocs(SETTINGS_COL)]);
    const allProducts = snapP.docs.map((d) => ({ id: d.id, ...d.data() }));
    const documentos = Object.fromEntries(snapS.docs.filter((d) => d.id !== "store").map((d) => [d.id, d.data()]));
    const backup = { version: 3, fecha: new Date().toISOString(), settings, products: allProducts, documentos };
    descargar(
      new Blob([JSON.stringify(backup)], { type: "application/json" }),
      `respaldo-${settings.nombre.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.json`
    );
    return allProducts.length;
  };

  const importBackup = async (file) => {
    const text = await file.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error("Archivo inválido"); }
    if (!data.products) throw new Error("El archivo no tiene el formato esperado");
    await Promise.all(data.products.map((p) => setDoc(doc(db, "products", p.id || uid()), p)));
    if (data.settings) await saveSettings(data.settings);
    if (data.documentos) {
      await Promise.all(Object.entries(data.documentos).map(([id, d]) => setDoc(doc(db, "settings", id), d)));
    }
  };

  // Vaciar catálogo: primero descarga un respaldo y luego borra productos y fotos originales.
  const vaciarCatalogo = async () => {
    await exportBackup();
    const snap = await getDocs(PRODUCTS_COL);
    for (let i = 0; i < snap.docs.length; i += 200) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 200).forEach((d) => { batch.delete(d.ref); batch.delete(originalDoc(d.id)); });
      await batch.commit();
    }
    setCart([]);
    return snap.docs.length;
  };

  // Catálogos preparados (carpeta /public/importar): agrega productos con sus fotos.
  const importarPaquete = async (paquete, { reemplazar, onProgreso } = {}) => {
    const res = await fetch(paquete.url, { cache: "no-store" });
    if (!res.ok) throw new Error("No se encontró el catálogo preparado.");
    const man = await res.json();
    const base = paquete.url.slice(0, paquete.url.lastIndexOf("/") + 1);
    if (reemplazar) await vaciarCatalogo();

    const nuevas = (man.categorias || []).filter((c) => !categorias.some((x) => x.toLowerCase() === c.toLowerCase()));
    if (nuevas.length) await guardarCategorias([...categorias, ...nuevas]);

    const ajustes = {};
    ["fotoAspecto", "tarjetaTam"].forEach((k) => { if (man.ajustes?.[k]) ajustes[k] = man.ajustes[k]; });
    if (Object.keys(ajustes).length) {
      setSettings((s) => ({ ...s, ...ajustes }));
      await setDoc(SETTINGS_DOC, ajustes, { merge: true });
    }

    const existentes = new Set(reemplazar ? [] : productsRaw.map((p) => p.id));
    const lista = man.productos || [];
    const ahora = Date.now();
    let cargados = 0;
    for (let i = 0; i < lista.length; i++) {
      const { id, imagen, original, ...campos } = lista[i];
      onProgreso?.(i + 1, lista.length);
      if (existentes.has(id)) continue;
      const stock = Math.max(0, Number(campos.cantidad) || 0);
      const record = {
        ...EMPTY_PRODUCT,
        ...campos,
        precioVenta: Number(campos.precioVenta) || 0,
        precioCompra: Number(campos.precioCompra) || 0,
        cantidad: stock,
        disponible: stock > 0,
        ventas: [],
        imagen: imagen ? await urlADataUrl(base + imagen) : null,
        createdAt: ahora - i * 1000, // conserva el orden del catálogo
      };
      if (original) await setDoc(originalDoc(id), { src: await urlADataUrl(base + original), productoId: id, actualizado: ahora });
      await setDoc(doc(db, "products", id), record);
      cargados++;
    }
    await setDoc(SETTINGS_DOC, { importados: { [man.id || paquete.id]: Date.now() } }, { merge: true });
    return cargados;
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  const vistaCliente = mode === "cliente";

  useEffect(() => {
    const v = varsColores(settings);
    Object.entries(v).forEach(([k, val]) => document.documentElement.style.setProperty(k, val));
  }, [settings]);

  return (
    <EdicionCtx.Provider value={ctx}>
      <div className="font-body min-h-screen flex flex-col" style={{ ...varsColores(settings), background: "var(--colorFondo)", color: "#2B2320" }}>
        <BrandStyles />

        <header className="sticky top-0 z-30 backdrop-blur-md border-b" style={{ background: "var(--colorEncabezado)", color: "var(--colorEncabezadoTexto)", borderColor: "#E4DDD1" }}>
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Editable as="div" className="rounded-full flex-shrink-0" onEditar={editarLogo} titulo="Cambiar o recortar el logo">
                <Logo src={imagenes.logo?.src} tam={Number(settings.logoTam) || 44} />
              </Editable>
              <div className="min-w-0">
                <T k="tienda.nombre" as="h1" className="font-display text-2xl leading-tight block" />
                <T k="tienda.tagline" as="p" className="text-[11px] tracking-widest uppercase block" style={{ color: "#9A8F80" }} />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isAdmin && (
                <button onClick={() => setShowSettings(true)} className="w-9 h-9 rounded-full flex items-center justify-center hover:opacity-70 transition" style={{ background: "#EFE2DE" }} aria-label={t("tienda.configuracion")} title={t("tienda.configuracion")}>
                  <Settings size={16} color="#6B5B52" />
                </button>
              )}
              <button
                onClick={() => (isAdmin ? salirAdmin() : setPinModal(true))}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition"
                style={isAdmin ? { background: "var(--colorBoton)", color: "var(--colorBotonTexto)" } : { background: "#EFE2DE", color: "#6B5B52" }}
                aria-label={t(isAdmin ? "tienda.modoTienda" : "tienda.administradora")}
              >
                {isAdmin ? <Unlock size={13} /> : <Lock size={13} />}
                {/* En modo edición, en celular solo se muestra el ícono para dejar espacio al nombre */}
                <span className={editando ? "hidden sm:inline" : undefined}>
                  <T k={isAdmin ? "tienda.modoTienda" : "tienda.administradora"} enBoton />
                </span>
              </button>
            </div>
          </div>
          {editando && (
            <BarraEdicion
              vista={mode}
              onVista={(v) => { setMode(v); window.scrollTo({ top: 0 }); }}
              onTextos={() => setPanel("textos")}
              onCategorias={() => setPanel("categorias")}
              onDiseno={() => setPanel("diseno")}
              onListo={terminarEdicion}
            />
          )}
        </header>

        {connError && (
          <div className="max-w-5xl mx-auto px-4 pt-3">
            <T k="general.errorConexion" as="div" className="text-xs rounded-lg px-3 py-2 block" style={{ background: "#FBEAEA", color: "#9C3B3B" }} />
          </div>
        )}

        {vistaCliente ? (
          <ClienteView
            products={filtered} query={query} setQuery={setQuery}
            activeCat={activeCat} setActiveCat={setActiveCat} categorias={categorias}
            onAdd={addToCart} loading={loading} total={visibles.length}
            settings={settings} portada={imagenes.portada?.src}
            acciones={{
              campo: editarCampoProducto, foto: editarFotoProducto, form: openEditForm, nuevo: openNewForm,
              categoria: editarCategoriaChip, nuevaCategoria: nuevaCategoriaChip, portada: editarPortada,
            }}
          />
        ) : (
          <AdminView
            products={products} loading={loading} onEditarSitio={editando ? null : entrarEdicion}
            onNew={openNewForm} onEdit={openEditForm} onDelete={deleteProduct}
            onVender={setVentaTarget} onOcultar={alternarOculto}
            onDeshacer={(p, v) => setDeshacer({ p, v })} onFoto={editarFotoProducto}
            onExport={exportExcel}
          />
        )}

        <footer className="mt-10 border-t" style={{ background: "var(--colorPie)", color: "var(--colorPieTexto)", borderColor: "#E4DDD1", marginTop: "auto" }}>
          <div className="max-w-5xl mx-auto px-4 py-6 text-center text-sm">
            <T k="pie.texto" as="p" className="block" />
          </div>
        </footer>

        {vistaCliente && !editando && cartCount > 0 && (
          <button onClick={() => setCartOpen(true)}
            className="fixed bottom-4 left-4 right-4 max-w-5xl mx-auto rounded-2xl shadow-xl px-5 py-4 flex items-center justify-between z-40"
            style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>
            <span className="flex items-center gap-2 text-sm font-medium"><ShoppingBag size={18} />{articulosTxt(cartCount)}</span>
            <span className="font-display text-lg">{money(cartTotal)}</span>
          </button>
        )}

        {cartOpen && (
          <Modal onClose={() => setCartOpen(false)} title={<T k="pedido.titulo" />}>
            {cart.length === 0 ? (
              <T k="pedido.vacio" as="p" className="text-sm py-8 text-center" style={{ color: "#9A8F80" }} />
            ) : (
              <div className="space-y-3">
                {cart.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 py-2 border-b" style={{ borderColor: "#EFE7DB" }}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{i.nombre}</p>
                      <p className="text-xs" style={{ color: "#9A8F80" }}>
                        {[i.detalle, t("pedido.cadaUno", { precio: money(i.precioVenta) })].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => updateQty(i.id, -1)} className="w-7 h-7 rounded-full border flex items-center justify-center" style={{ borderColor: "#E4DDD1" }}>−</button>
                      <span className="w-5 text-center text-sm">{i.qty}</span>
                      <button onClick={() => updateQty(i.id, 1)} className="w-7 h-7 rounded-full border flex items-center justify-center" style={{ borderColor: "#E4DDD1" }}>+</button>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2">
                  <span className="font-medium text-sm"><T k="pedido.total" /> ({articulosTxt(cartCount)})</span>
                  <span className="font-display text-xl">{money(cartTotal)}</span>
                </div>
                <button onClick={sendOrderWhatsApp} className="w-full mt-2 rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-medium" style={{ background: "#25D366", color: "#fff" }}>
                  <Send size={15} /> <T k="pedido.enviar" />
                </button>
              </div>
            )}
          </Modal>
        )}

        {ventaTarget && (
          <VentaModal p={products.find((x) => x.id === ventaTarget.id) || ventaTarget} onCerrar={() => setVentaTarget(null)} onRegistrar={registrarVenta} />
        )}

        {deshacer && (
          <DeshacerModal p={deshacer.p} venta={deshacer.v} pin={settings.pin} onCerrar={() => setDeshacer(null)}
            onConfirmar={async () => { await deshacerVenta(deshacer.p.id, deshacer.v.id); setDeshacer(null); avisar(t("general.guardado")); }} />
        )}

        {pinModal && (
          <Modal onClose={() => { setPinModal(false); setPinInput(""); setPinError(""); }} title={<T k="acceso.titulo" />}>
            <T k="acceso.texto" as="p" className="text-sm mb-4 block" style={{ color: "#9A8F80" }} />
            <input type="password" inputMode="numeric" autoFocus value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryEnterAdmin()}
              className="w-full rounded-xl border px-4 py-3 text-center text-lg tracking-[0.4em]" style={{ borderColor: "#E4DDD1" }} placeholder="••••" />
            {pinError && <p className="text-xs mt-2 text-center" style={{ color: "#B23B3B" }}>{pinError}</p>}
            <button onClick={() => tryEnterAdmin(false)} className="w-full mt-4 rounded-xl py-3 text-sm font-medium" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>{t("acceso.entrar")}</button>
            <button onClick={() => tryEnterAdmin(true)} className="w-full mt-2 rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: "#EFE2DE", color: "var(--colorAcento)" }}>
              <Pencil size={13} /> {t("acceso.entrarEditar")}
            </button>
            <T k="acceso.ayuda" as="p" className="text-[11px] mt-3 text-center block" style={{ color: "#B7ACA0" }} />
          </Modal>
        )}

        {showSettings && (
          <Modal onClose={() => setShowSettings(false)} title={<T k="config.titulo" />}>
            <SettingsForm
              settings={settings}
              onSave={async (parcial) => { setSettings((s) => ({ ...s, ...parcial })); await saveSettings(parcial); setShowSettings(false); }}
              products={products} onExportBackup={exportBackup} onImportBackup={importBackup}
              onVaciar={vaciarCatalogo} onImportarPaquete={importarPaquete}
            />
          </Modal>
        )}

        {formOpen && (
          <Modal onClose={closeForm} title={<T k={editingId ? "form.tituloEditar" : "form.tituloNuevo"} />} wide>
            <ProductForm form={form} setForm={setForm} formImage={formImage}
              onEditarFoto={editarFotoFormulario}
              onQuitarFoto={() => { setFormImage(null); setFormFoto({ original: null, recorte: null }); }}
              onSubmit={submitForm} onCancel={closeForm} saving={saving}
              categorias={categorias} onAgregarCategoria={agregarCategoria}
              vendidas={editingId ? piezasVendidas(products.find((p) => p.id === editingId) || {}) : 0}
              aspecto={settings.fotoAspecto} />
          </Modal>
        )}

        {panel === "textos" && (
          <TextosPanel valorCrudo={valorCrudo} esModificado={esModificado}
            onGuardar={guardarTexto} onRestaurar={restaurarTexto} onCerrar={() => setPanel(null)} />
        )}
        {panel === "categorias" && (
          <CategoriasPanel categorias={categorias} conteo={conteoCategorias} t={t}
            onAgregar={agregarCategoria} onRenombrar={renombrarCategoria} onEliminar={eliminarCategoria} onMover={moverCategoria}
            onCerrar={() => setPanel(null)} />
        )}
        {panel === "diseno" && (
          <DisenoPanel
            settings={settings}
            imagenes={{ logo: imagenes.logo?.src, portada: imagenes.portada?.src }}
            logoPorDefecto={<ButterflyIcon size={30} />}
            onAjuste={guardarAjuste}
            onEditarLogo={editarLogo} onQuitarLogo={quitarImagenSitio("logo")}
            onEditarPortada={editarPortada} onQuitarPortada={quitarImagenSitio("portada")}
            onCerrar={() => setPanel(null)} />
        )}

        {editorCampo && <EditorCampo key={editorCampo.titulo + (editorCampo.seccion || "")} cfg={editorCampo} onCerrar={() => setEditorCampo(null)} />}
        {editorImagen && <ImageEditor {...editorImagen} onCancelar={() => setEditorImagen(null)} />}

        {aviso && (
          <div className="fixed left-1/2 -translate-x-1/2 bottom-24 px-4 py-2.5 rounded-full text-sm shadow-lg flex items-center gap-2" style={{ zIndex: 90, background: aviso.tipo === "error" ? "#9C3B3B" : "#2B2320", color: "#F7F3EC" }}>
            {aviso.tipo === "error" ? <AlertTriangle size={14} /> : <Check size={14} />} {aviso.texto}
          </div>
        )}
      </div>
    </EdicionCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Vista cliente
// ---------------------------------------------------------------------------
function ClienteView({ products, query, setQuery, activeCat, setActiveCat, categorias, onAdd, loading, total, settings, portada, acciones }) {
  const { t, editando } = useEdicion();
  const tam = settings.tarjetaTam || "normal";
  return (
    <main className="max-w-5xl mx-auto px-4 pb-32">
      {(portada || editando) && (
        <div className="pt-5">
          {portada ? (
            <div className="relative rounded-2xl overflow-hidden">
              <img src={portada} alt={t("catalogo.portadaAlt", { tienda: settings.nombre })} className="w-full block" />
              <BotonFoto onClick={acciones.portada} texto="Portada" className="absolute bottom-3 left-3" />
            </div>
          ) : (
            <button type="button" onClick={acciones.portada} className="w-full rounded-2xl border-2 border-dashed py-6 flex items-center justify-center gap-2 text-sm" style={{ borderColor: "#E3A9B4", color: "var(--colorAcento)" }}>
              <ImagePlus size={16} /> Agregar imagen de portada (opcional)
            </button>
          )}
        </div>
      )}

      <div className="pt-6 pb-2">
        <T k="catalogo.buscarTitulo" as="p" className="text-sm mb-2 block" style={{ color: "#6B5B52" }} />
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" color="#B7ACA0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("catalogo.buscarPh")}
            className="w-full rounded-full border pl-11 pr-4 py-3 text-sm outline-none focus:ring-2" style={{ borderColor: "#E4DDD1", background: "#fff" }} />
          <EditBadge k="catalogo.buscarPh" etiqueta="Ejemplo" className="absolute right-3 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none py-3 -mx-4 px-4">
        <button onClick={() => setActiveCat("Todas")} className="flex-shrink-0 px-4 py-2 rounded-full text-sm border transition"
          style={activeCat === "Todas" ? { background: "var(--colorBoton)", color: "var(--colorBotonTexto)", borderColor: "#2B2320" } : { background: "#fff", color: "#6B5B52", borderColor: "#E4DDD1" }}>
          <T k="catalogo.todas" />
        </button>
        {categorias.map((c) => (
          <button key={c} onClick={() => setActiveCat(c)} className="flex-shrink-0 px-4 py-2 rounded-full text-sm border transition"
            style={activeCat === c ? { background: "var(--colorBoton)", color: "var(--colorBotonTexto)", borderColor: "#2B2320" } : { background: "#fff", color: "#6B5B52", borderColor: "#E4DDD1" }}>
            <Editable onEditar={() => acciones.categoria(c)} titulo="Renombrar o eliminar categoría">{c}</Editable>
          </button>
        ))}
        {editando && (
          <button type="button" onClick={acciones.nuevaCategoria} className="flex-shrink-0 px-4 py-2 rounded-full text-sm border border-dashed flex items-center gap-1" style={{ borderColor: "var(--colorAcento)", color: "var(--colorAcento)", background: "#fff" }}>
            <Plus size={14} /> Categoría
          </button>
        )}
      </div>

      <div className="pt-4 pb-2">
        <T k="catalogo.titulo" as="h2" className="font-display text-3xl block" />
        <T k="catalogo.subtitulo" as="p" className="text-sm mt-1 block" style={{ color: "#9A8F80" }} />
      </div>

      {loading ? (
        <T k="catalogo.cargando" as="div" className="py-20 text-center text-sm block" style={{ color: "#B7ACA0" }} />
      ) : (
        <>
          {total === 0 && !editando ? (
            <EmptyState k="catalogo.vacio" />
          ) : products.length === 0 && !editando ? (
            <EmptyState k="catalogo.sinResultados" />
          ) : (
            <div className={`${GRID_TARJETAS[tam] || GRID_TARJETAS.normal} pt-4`}>
              {editando && (
                <button type="button" onClick={acciones.nuevo} className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-sm p-4" style={{ borderColor: "#E3A9B4", color: "var(--colorAcento)", minHeight: 160 }}>
                  <Plus size={20} /> Agregar producto
                </button>
              )}
              {products.map((p) => (
                <ProductCard key={p.id} p={p} onAdd={() => onAdd(p)} aspecto={aspectoCss(settings.fotoAspecto)} compacto={tam === "chico"}
                  acciones={{
                    foto: () => acciones.foto(p), form: () => acciones.form(p),
                    nombre: () => acciones.campo(p, "nombre"), precio: () => acciones.campo(p, "precioVenta"), categoria: () => acciones.campo(p, "categoria"),
                  }} />
              ))}
            </div>
          )}
          {editando && products.length === 0 && <EmptyState k={total === 0 ? "catalogo.vacio" : "catalogo.sinResultados"} />}
        </>
      )}
    </main>
  );
}

function ProductCard({ p, onAdd, aspecto, compacto, acciones }) {
  const { t, editando } = useEdicion();
  const [added, setAdded] = useState(false);
  const [showLoc, setShowLoc] = useState(false);
  return (
    <div className="rounded-2xl overflow-hidden border flex flex-col" style={{ borderColor: "#E9E1D4", background: "#fff" }}>
      <div className="relative flex items-center justify-center" style={{ background: "#EFE7DB", aspectRatio: aspecto }}>
        {p.imagen ? <img src={p.imagen} alt={p.nombre} className="w-full h-full object-cover" loading="lazy" /> : <ImageOff size={22} color="#C6BBAC" />}
        {editando && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.88)", color: "#6B5B52" }}>
            {t("prod.stock", { n: p.cantidad })}
          </span>
        )}
        <BotonFoto onClick={acciones.foto} className="absolute bottom-2 left-2" />
        {p.ubicacion && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setShowLoc((v) => !v); }}
              className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition hover:scale-110"
              style={{ background: "rgba(255,255,255,0.75)", backdropFilter: "blur(2px)" }}
              aria-label={t("tarjeta.info")} title={t("tarjeta.info")}
            >
              <Info size={13} color="#6B5B52" />
            </button>
            {showLoc && (
              <div
                onClick={(e) => { e.stopPropagation(); setShowLoc(false); }}
                className="absolute inset-0 flex items-center justify-center p-3 cursor-pointer"
                style={{ background: "rgba(43,35,32,0.55)" }}
              >
                <div className="rounded-xl px-3 py-2.5 shadow-lg text-center w-full" style={{ background: "#F7F3EC" }}>
                  <T k="tarjeta.ubicacion" as="p" className="text-[9px] tracking-widest uppercase block" style={{ color: "var(--colorAcento)" }} />
                  <p className="text-xs font-medium mt-0.5" style={{ color: "#2B2320" }}>{p.ubicacion}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className={`${compacto ? "p-2" : "p-3"} flex flex-col flex-1`}>
        <Editable as="p" className="text-[10px] tracking-widest uppercase" style={{ color: "var(--colorAcento)" }} onEditar={acciones.categoria} titulo="Cambiar categoría">
          {p.categoria || (editando ? t("dash.sinCategoria") : "")}
        </Editable>
        <Editable as="p" className={`${compacto ? "text-xs" : "text-sm"} font-medium leading-snug mt-0.5 line-clamp-2`} onEditar={acciones.nombre} titulo="Editar nombre">{p.nombre}</Editable>
        {(p.talla || p.color) && <Editable as="p" className="text-[11px] mt-0.5" style={{ color: "#9A8F80" }} onEditar={acciones.form} titulo="Editar producto">{detalleDe(p)}</Editable>}
        {(p.material || p.grupo) && <Editable as="p" className="text-[11px]" style={{ color: "#B7ACA0" }} onEditar={acciones.form} titulo="Editar producto">{[p.material, p.grupo].filter(Boolean).join(" · ")}</Editable>}
        <div className="flex items-center justify-between mt-auto pt-2 gap-1">
          <Editable as="span" className={`font-display ${compacto ? "text-lg" : "text-2xl"} leading-none`} style={{ color: "#2B2320" }} onEditar={acciones.precio} titulo="Editar precio">{money(p.precioVenta)}</Editable>
          {editando ? (
            <button onClick={acciones.form} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--colorAcento)", color: "#fff" }} aria-label="Editar producto" title="Editar todos los datos">
              <Pencil size={14} />
            </button>
          ) : (
            <button onClick={() => { if (onAdd()) { setAdded(true); setTimeout(() => setAdded(false), 1200); } }}
              className="w-8 h-8 rounded-full flex items-center justify-center transition flex-shrink-0"
              style={added ? { background: "#4CAF50", color: "#fff" } : { background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }} aria-label={t("tarjeta.agregar")}>
              {added ? <Check size={15} /> : <Plus size={15} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ k }) {
  return <div className="py-16 text-center"><T k={k} as="p" className="font-display text-xl block" style={{ color: "#9A8F80" }} /></div>;
}

// ---------------------------------------------------------------------------
// Vista administradora
// ---------------------------------------------------------------------------
function AdminView({ products, loading, onEditarSitio, onNew, onEdit, onDelete, onVender, onOcultar, onDeshacer, onFoto, onExport }) {
  const [tab, setTab] = useState("dashboard");
  return (
    <main className="max-w-5xl mx-auto px-4 pb-16">
      <div className="flex flex-wrap gap-2 pt-6">
        <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={<LayoutDashboard size={14} />} k="admin.tabDashboard" />
        <TabButton active={tab === "productos"} onClick={() => setTab("productos")} icon={<Package size={14} />} k="admin.tabProductos" />
        {onEditarSitio && (
          <button onClick={onEditarSitio} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition" style={{ background: "var(--colorAcento)", color: "#fff" }}>
            <Pencil size={14} /> <T k="admin.editar" enBoton />
          </button>
        )}
      </div>

      {tab === "dashboard"
        ? <Dashboard products={products} onExport={onExport} />
        : <ProductosTab products={products} loading={loading} onNew={onNew} onEdit={onEdit} onDelete={onDelete}
            onVender={onVender} onOcultar={onOcultar} onDeshacer={onDeshacer} onFoto={onFoto} />}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function Dashboard({ products, onExport }) {
  const { t } = useEdicion();
  const hoy = new Date();
  const hace30 = new Date(hoy.getTime() - 29 * DAY_MS);
  const [desde, setDesde] = useState(tsToDateStr(hace30.getTime()));
  const [hasta, setHasta] = useState(tsToDateStr(hoy.getTime()));

  const d = useMemo(() => {
    const conStock = products.filter((p) => p.cantidad > 0);
    const ventas = ventasPlanas(products);

    const totalPiezas = conStock.reduce((s, p) => s + p.cantidad, 0);
    const inversion = conStock.reduce((s, p) => s + (Number(p.precioCompra) || 0) * p.cantidad, 0);
    const valorVenta = conStock.reduce((s, p) => s + (Number(p.precioVenta) || 0) * p.cantidad, 0);
    const totalVentas = ventas.reduce((s, v) => s + v.precio * v.qty, 0);
    const piezas = ventas.reduce((s, v) => s + v.qty, 0);

    const agrupar = (campo, fallback) => {
      const map = {};
      conStock.forEach((p) => {
        const k = (p[campo] || "").trim() || fallback;
        if (!map[k]) map[k] = { piezas: 0, inversion: 0, venta: 0 };
        map[k].piezas += p.cantidad;
        map[k].inversion += (Number(p.precioCompra) || 0) * p.cantidad;
        map[k].venta += (Number(p.precioVenta) || 0) * p.cantidad;
      });
      return Object.entries(map)
        .map(([nombre, v]) => ({ nombre, ...v, utilidad: v.venta - v.inversion }))
        .sort((a, b) => b.venta - a.venta);
    };

    return {
      totalPiezas, inversion, valorVenta, totalVentas, piezasVendidas: piezas,
      porCategoria: agrupar("categoria", t("dash.sinCategoria")),
      porGrupo: agrupar("grupo", t("dash.sinTemporada")),
      ventas,
    };
  }, [products, t]);

  // ----- Reporte de ventas filtrado por fechas -----
  const reporte = useMemo(() => {
    const tsDesde = dateStrToTs(desde);
    const tsHasta = dateStrToTs(hasta);
    const iniDia = tsDesde ? new Date(tsDesde).setHours(0, 0, 0, 0) : -Infinity;
    const finDia = tsHasta ? new Date(tsHasta).setHours(23, 59, 59, 999) : Infinity;

    const ventas = d.ventas
      .filter((v) => v.at && v.at >= iniDia && v.at <= finDia)
      .sort((a, b) => b.at - a.at);

    const total = ventas.reduce((s, v) => s + v.precio * v.qty, 0);
    const costo = ventas.reduce((s, v) => s + v.costo * v.qty, 0);
    const piezas = ventas.reduce((s, v) => s + v.qty, 0);

    // Serie diaria para la gráfica
    const dias = [];
    if (isFinite(iniDia) && isFinite(finDia) && finDia >= iniDia) {
      const nDias = Math.min(62, Math.round((finDia - iniDia) / DAY_MS) + 1);
      for (let i = 0; i < nDias; i++) {
        const dia = new Date(iniDia + i * DAY_MS);
        const ini = new Date(dia).setHours(0, 0, 0, 0);
        const fin = new Date(dia).setHours(23, 59, 59, 999);
        const monto = ventas
          .filter((v) => v.at >= ini && v.at <= fin)
          .reduce((s, v) => s + v.precio * v.qty, 0);
        dias.push({
          etiqueta: dia.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", ""),
          fecha: dia.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" }),
          monto,
        });
      }
    }
    return { ventas, total, costo, piezas, utilidad: total - costo, dias };
  }, [d.ventas, desde, hasta]);

  const rangoRapido = (dias) => {
    const fin = new Date();
    const ini = new Date(fin.getTime() - (dias - 1) * DAY_MS);
    setDesde(tsToDateStr(ini.getTime()));
    setHasta(tsToDateStr(fin.getTime()));
  };

  return (
    <div className="pt-6 space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<Package size={18} />} label={<T k="dash.kpiArticulos" />} value={d.totalPiezas} sub={<T k="dash.kpiArticulosSub" />} />
        <KpiCard icon={<DollarSign size={18} />} label={<T k="dash.kpiInversion" />} value={money(d.inversion)} sub={<T k="dash.kpiInversionSub" />} />
        <KpiCard icon={<Tag size={18} />} label={<T k="dash.kpiValor" />} value={money(d.valorVenta)} sub={<T k="dash.kpiValorSub" />} />
        <KpiCard icon={<ShoppingBag size={18} />} label={<T k="dash.kpiVentas" />} value={money(d.totalVentas)}
          sub={<><T k="dash.kpiVentasSub" /> <strong style={{ color: "var(--colorAcento)" }}>{d.piezasVendidas}</strong></>} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Inventario por categoría */}
        <Panel title={<T k="dash.porCategoria" />} action={
          <button onClick={onExport} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{ background: "#EFE2DE", color: "#6B5B52" }}>
            <Download size={12} /> <T k="dash.excel" enBoton />
          </button>
        }>
          {d.porCategoria.length === 0 ? (
            <T k="dash.sinDatos" as="p" className="text-sm py-6 text-center block" style={{ color: "#B7ACA0" }} />
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: "#9A8F80" }}>
                    <th className="text-left font-medium pb-2 px-1"><T k="dash.colCategoria" /></th>
                    <th className="text-right font-medium pb-2 px-1"><T k="dash.colPiezas" /></th>
                    <th className="text-right font-medium pb-2 px-1"><T k="dash.colInversion" /></th>
                    <th className="text-right font-medium pb-2 px-1"><T k="dash.colValorVenta" /></th>
                    <th className="text-right font-medium pb-2 px-1"><T k="dash.colUtilidad" /></th>
                  </tr>
                </thead>
                <tbody>
                  {d.porCategoria.map((c) => (
                    <tr key={c.nombre} className="border-t" style={{ borderColor: "#F1EBE0" }}>
                      <td className="py-2.5 px-1 font-medium">{c.nombre}</td>
                      <td className="py-2.5 px-1 text-right" style={{ color: "#6B5B52" }}>{c.piezas}</td>
                      <td className="py-2.5 px-1 text-right" style={{ color: "#9A8F80" }}>{money(c.inversion)}</td>
                      <td className="py-2.5 px-1 text-right" style={{ color: "#6B5B52" }}>{money(c.venta)}</td>
                      <td className="py-2.5 px-1 text-right font-medium" style={{ color: c.utilidad >= 0 ? "#2F8542" : "#B23B3B" }}>{money(c.utilidad)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center gap-2 pt-3 mt-1 border-t text-xs" style={{ borderColor: "#F1EBE0", color: "#9A8F80" }}>
            <Package size={13} /> <T k="dash.totalPiezas" /> <strong style={{ color: "var(--colorAcento)" }}>{d.totalPiezas}</strong>
          </div>
        </Panel>

        {/* Temporalidad */}
        <Panel title={<T k="dash.temporalidad" />} icon={<Tag size={15} color="var(--colorAcento)" />}>
          {d.porGrupo.length === 0 ? (
            <div className="py-10 text-center">
              <T k="dash.temporalidadVacia" as="p" className="text-sm block" style={{ color: "#B7ACA0" }} />
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "#9A8F80" }}>
                  <th className="text-left font-medium pb-2 px-1"><T k="dash.colTemporada" /></th>
                  <th className="text-right font-medium pb-2 px-1"><T k="dash.colPiezas" /></th>
                  <th className="text-right font-medium pb-2 px-1"><T k="dash.colValorVenta" /></th>
                  <th className="text-right font-medium pb-2 px-1"><T k="dash.colUtilidad" /></th>
                </tr>
              </thead>
              <tbody>
                {d.porGrupo.map((g) => (
                  <tr key={g.nombre} className="border-t" style={{ borderColor: "#F1EBE0" }}>
                    <td className="py-2.5 px-1 font-medium">{g.nombre}</td>
                    <td className="py-2.5 px-1 text-right" style={{ color: "#6B5B52" }}>{g.piezas}</td>
                    <td className="py-2.5 px-1 text-right" style={{ color: "var(--colorAcento)" }}>{money(g.venta)}</td>
                    <td className="py-2.5 px-1 text-right font-medium" style={{ color: g.utilidad >= 0 ? "#2F8542" : "#B23B3B" }}>{money(g.utilidad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {/* Reporte de ventas */}
      <Panel title={<T k="dash.reporte" />} icon={<BarChart3 size={15} color="var(--colorAcento)" />}>
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div>
            <T k="dash.desde" as="label" className="text-[10px] uppercase tracking-wide" style={{ color: "#9A8F80" }} />
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="block rounded-lg border px-2.5 py-1.5 text-xs mt-0.5" style={{ borderColor: "#E4DDD1", background: "#fff" }} />
          </div>
          <div>
            <T k="dash.hasta" as="label" className="text-[10px] uppercase tracking-wide" style={{ color: "#9A8F80" }} />
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="block rounded-lg border px-2.5 py-1.5 text-xs mt-0.5" style={{ borderColor: "#E4DDD1", background: "#fff" }} />
          </div>
          <div className="flex gap-1.5">
            {[["dash.rango7", 7], ["dash.rango30", 30], ["dash.rango90", 90]].map(([k, n]) => (
              <button key={n} onClick={() => rangoRapido(n)} className="text-[11px] px-2.5 py-1.5 rounded-full" style={{ background: "#EFE2DE", color: "#6B5B52" }}><T k={k} enBoton /></button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <MiniStat label={<T k="dash.miniTotal" />} value={money(reporte.total)} big />
          <MiniStat label={<T k="dash.miniPiezas" />} value={reporte.piezas} />
          <MiniStat label={<T k="dash.miniUtilidad" />} value={money(reporte.utilidad)} color={reporte.utilidad >= 0 ? "#2F8542" : "#B23B3B"} />
        </div>

        <SalesChart dias={reporte.dias} />

        {reporte.ventas.length === 0 ? (
          <T k="dash.sinVentas" as="p" className="text-sm py-6 text-center block" style={{ color: "#B7ACA0" }} />
        ) : (
          <div className="mt-4 border-t pt-3" style={{ borderColor: "#F1EBE0" }}>
            <T k="dash.detalle" vars={{ n: reporte.ventas.length }} as="p" className="text-[10px] uppercase tracking-wide mb-2 block" style={{ color: "#9A8F80" }} />
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {reporte.ventas.map((v) => (
                <div key={`${v.productoId}-${v.id}`} className="flex items-center justify-between gap-3 text-xs py-1.5 border-b last:border-0" style={{ borderColor: "#F7F3EC" }}>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{v.nombre}</p>
                    <p style={{ color: "#9A8F80" }}>{fmtDateTime(v.at)} · {t("dash.ventaPiezas", { n: v.qty })}</p>
                  </div>
                  <span className="font-medium flex-shrink-0" style={{ color: "var(--colorAcento)" }}>{money(v.precio * v.qty)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function SalesChart({ dias }) {
  if (!dias.length) return null;
  const max = Math.max(...dias.map((d) => d.monto), 1);
  const compacto = dias.length > 14;
  return (
    <div className="rounded-xl p-3" style={{ background: "#FBF8F3" }}>
      <div className="flex items-end gap-1 h-32">
        {dias.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative min-w-0">
            {d.monto > 0 && !compacto && (
              <span className="text-[9px] mb-1" style={{ color: "#9A8F80" }}>{money(d.monto)}</span>
            )}
            <div className="w-full rounded-t transition-all"
              style={{ height: `${Math.max(d.monto > 0 ? 4 : 1, (d.monto / max) * 100)}%`, background: d.monto > 0 ? "#E3A9B4" : "#EFE7DB", minHeight: 2 }}
              title={`${d.fecha}: ${money(d.monto)}`} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1.5">
        {dias.map((d, i) => (
          <span key={i} className="flex-1 text-center text-[8px] truncate" style={{ color: "#B7ACA0" }}>
            {compacto ? (i % Math.ceil(dias.length / 8) === 0 ? d.fecha : "") : d.etiqueta}
          </span>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, icon, action, children }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "#E9E1D4", background: "#fff" }}>
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#6B5B52" }}>{title}</h3>
        {action || icon}
      </div>
      {children}
    </div>
  );
}

function KpiCard({ icon, label, value, sub }) {
  return (
    <div className="rounded-2xl border p-4 flex items-start gap-3" style={{ borderColor: "#F0E4E4", background: "#FDF7F5" }}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#F6E4E4", color: "var(--colorAcento)" }}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] leading-tight" style={{ color: "#9A8F80" }}>{label}</p>
        <p className="font-display text-2xl leading-tight mt-0.5">{value}</p>
        <p className="text-[10px] mt-0.5" style={{ color: "#B7ACA0" }}>{sub}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value, big, color }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "#FBF8F3" }}>
      <p className="text-[10px]" style={{ color: "#9A8F80" }}>{label}</p>
      <p className={`font-display ${big ? "text-2xl" : "text-xl"} leading-tight mt-0.5`} style={{ color: color || "#2B2320" }}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña de productos con filtro inteligente
// ---------------------------------------------------------------------------
const FILTROS_VACIOS = {
  estado: "todos", categoria: "", color: "", grupo: "", proveedor: "",
  compraDesde: "", compraHasta: "", orden: "reciente",
};

function ProductosTab({ products, loading, onNew, onEdit, onDelete, onVender, onOcultar, onDeshacer, onFoto }) {
  const { t } = useEdicion();
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState(FILTROS_VACIOS);

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  const opciones = useMemo(() => {
    const uniq = (campo) => [...new Set(products.map((p) => (p[campo] || "").trim()).filter(Boolean))].sort();
    return { categorias: uniq("categoria"), colores: uniq("color"), grupos: uniq("grupo"), proveedores: uniq("proveedor") };
  }, [products]);

  const activos = useMemo(
    () => Object.entries(f).filter(([k, v]) => v && v !== FILTROS_VACIOS[k]).length,
    [f]
  );

  const lista = useMemo(() => {
    const terms = q.toLowerCase().split(/[\s+]+/).filter(Boolean);
    const tsDesde = dateStrToTs(f.compraDesde);
    const tsHasta = dateStrToTs(f.compraHasta);

    let out = products.filter((p) => {
      if (f.estado === "disponible" && (p.cantidad <= 0 || p.oculto)) return false;
      if (f.estado === "agotado" && p.cantidad > 0) return false;
      if (f.estado === "oculto" && !p.oculto) return false;
      if (f.categoria && p.categoria !== f.categoria) return false;
      if (f.color && (p.color || "").trim() !== f.color) return false;
      if (f.grupo && (p.grupo || "").trim() !== f.grupo) return false;
      if (f.proveedor && (p.proveedor || "").trim() !== f.proveedor) return false;

      if (tsDesde || tsHasta) {
        const tsCompra = dateStrToTs(p.fechaCompra);
        if (!tsCompra) return false;
        if (tsDesde && tsCompra < tsDesde) return false;
        if (tsHasta && tsCompra > tsHasta) return false;
      }

      if (terms.length === 0) return true;
      const hay = [p.nombre, p.categoria, p.subcategoria, p.color, p.talla, p.material, p.genero, p.grupo, p.proveedor, p.ubicacion]
        .join(" ").toLowerCase();
      return terms.every((term) => hay.includes(term));
    });

    const dias = (p) => diasEnInventario(p) ?? -1;
    if (f.orden === "antiguos") out = [...out].sort((a, b) => dias(b) - dias(a));
    else if (f.orden === "precioAlto") out = [...out].sort((a, b) => (Number(b.precioVenta) || 0) - (Number(a.precioVenta) || 0));
    else if (f.orden === "precioBajo") out = [...out].sort((a, b) => (Number(a.precioVenta) || 0) - (Number(b.precioVenta) || 0));
    else if (f.orden === "nombre") out = [...out].sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
    return out;
  }, [products, q, f]);

  return (
    <div className="pt-6">
      <button onClick={onNew} className="w-full rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-medium mb-3" style={{ background: "var(--colorAcento)", color: "#fff" }}>
        <Plus size={16} /> <T k="prod.agregar" enBoton />
      </button>

      {/* Búsqueda inteligente + filtros */}
      <div className="relative mb-2">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" color="#B7ACA0" />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t("prod.buscarPh")}
          className="w-full rounded-full border pl-10 pr-4 py-2.5 text-sm outline-none"
          style={{ borderColor: "#E4DDD1", background: "#fff" }} />
        <EditBadge k="prod.buscarPh" etiqueta="Ejemplo" className="absolute right-3 top-1/2 -translate-y-1/2" />
      </div>

      <div className="flex items-center justify-between gap-2 mb-3">
        <button onClick={() => setAbierto((v) => !v)}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full"
          style={abierto || activos ? { background: "var(--colorBoton)", color: "var(--colorBotonTexto)" } : { background: "#fff", color: "#6B5B52", border: "1px solid #E4DDD1" }}>
          <Filter size={13} /> <T k="prod.filtros" enBoton />{activos > 0 ? ` (${activos})` : ""}
        </button>
        <T k="prod.conteo" vars={{ n: lista.length, total: products.length }} as="span" className="text-xs" style={{ color: "#9A8F80" }} />
      </div>

      {abierto && (
        <div className="rounded-2xl border p-4 mb-3 space-y-3" style={{ borderColor: "#E9E1D4", background: "#fff" }}>
          <div>
            <T k="prod.estado" as="label" className="text-[10px] uppercase tracking-wide" style={{ color: "#9A8F80" }} />
            <div className="flex gap-1.5 mt-1">
              {[["todos", "prod.estadoTodos"], ["disponible", "prod.estadoDisponible"], ["agotado", "prod.estadoAgotado"], ["oculto", "prod.estadoOculto"]].map(([v, k]) => (
                <button key={v} onClick={() => setF((prev) => ({ ...prev, estado: v }))}
                  className="text-[11px] px-2 py-1.5 rounded-full flex-1"
                  style={f.estado === v ? { background: "var(--colorBoton)", color: "var(--colorBotonTexto)" } : { background: "#F7F3EC", color: "#6B5B52" }}><T k={k} enBoton /></button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectFiltro k="prod.filtroCategoria" value={f.categoria} onChange={set("categoria")} options={opciones.categorias} />
            <SelectFiltro k="prod.filtroColor" value={f.color} onChange={set("color")} options={opciones.colores} />
            <SelectFiltro k="prod.filtroGrupo" value={f.grupo} onChange={set("grupo")} options={opciones.grupos} />
            <SelectFiltro k="prod.filtroProveedor" value={f.proveedor} onChange={set("proveedor")} options={opciones.proveedores} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <T k="prod.compraDesde" as="label" className="text-[10px] uppercase tracking-wide" style={{ color: "#9A8F80" }} />
              <input type="date" value={f.compraDesde} onChange={set("compraDesde")} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <T k="prod.compraHasta" as="label" className="text-[10px] uppercase tracking-wide" style={{ color: "#9A8F80" }} />
              <input type="date" value={f.compraHasta} onChange={set("compraHasta")} className={inputCls} style={inputStyle} />
            </div>
          </div>

          <div>
            <T k="prod.ordenar" as="label" className="text-[10px] uppercase tracking-wide" style={{ color: "#9A8F80" }} />
            <select value={f.orden} onChange={set("orden")} className={inputCls} style={inputStyle}>
              <option value="reciente">{t("prod.ordenReciente")}</option>
              <option value="antiguos">{t("prod.ordenAntiguos")}</option>
              <option value="precioAlto">{t("prod.ordenPrecioAlto")}</option>
              <option value="precioBajo">{t("prod.ordenPrecioBajo")}</option>
              <option value="nombre">{t("prod.ordenNombre")}</option>
            </select>
          </div>

          <button onClick={() => { setF(FILTROS_VACIOS); setQ(""); }}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-medium"
            style={{ background: "#F7F3EC", color: "#6B5B52" }}>
            <RotateCcw size={12} /> <T k="prod.limpiar" enBoton />
          </button>
        </div>
      )}

      {loading ? (
        <T k="prod.cargando" as="div" className="py-16 text-center text-sm block" style={{ color: "#B7ACA0" }} />
      ) : products.length === 0 ? (
        <EmptyState k="prod.vacio" />
      ) : lista.length === 0 ? (
        <EmptyState k="prod.sinCoincidencias" />
      ) : (
        <div className="space-y-2">
          {lista.map((p) => (
            <FilaProducto key={p.id} p={p} onEdit={onEdit} onDelete={onDelete} onVender={onVender}
              onOcultar={onOcultar} onDeshacer={onDeshacer} onFoto={onFoto} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilaProducto({ p, onEdit, onDelete, onVender, onOcultar, onDeshacer, onFoto }) {
  const { t } = useEdicion();
  const [verVentas, setVerVentas] = useState(false);
  const agotado = p.cantidad <= 0;
  const dias = diasEnInventario(p);
  const ult = ultimaVenta(p);
  const vendidas = piezasVendidas(p);
  return (
    <div className="rounded-xl border p-2.5" style={{ borderColor: "#E9E1D4", background: "#fff", opacity: agotado || p.oculto ? 0.72 : 1 }}>
      <div className="flex items-center gap-3">
        <Editable as="div" onEditar={() => onFoto(p)} titulo="Cambiar o recortar foto" className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: "#EFE7DB" }}>
          {p.imagen ? <img src={p.imagen} alt="" className="w-full h-full object-cover" /> : <ImageOff size={16} color="#C6BBAC" />}
        </Editable>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{p.nombre}</p>
          <p className="text-xs truncate" style={{ color: "#9A8F80" }}>{[p.categoria, money(p.precioVenta), detalleDe(p)].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="flex-shrink-0 text-[10px] font-medium px-2.5 py-1.5 rounded-full tracking-wide uppercase"
          style={agotado ? { background: "#F1EBE0", color: "#8A7F71" } : { background: "#E4F3E6", color: "#2F8542" }}>
          {agotado ? t("prod.estadoAgotado") : t("prod.stock", { n: p.cantidad })}
        </span>
        <button onClick={() => onEdit(p)} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#EFE2DE" }} aria-label={t("prod.editar")} title={t("prod.editar")}><Pencil size={13} color="#6B5B52" /></button>
        <button onClick={() => { if (window.confirm(t("prod.confirmarEliminar", { nombre: p.nombre }))) onDelete(p.id); }} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#FBEAEA" }} aria-label={t("prod.eliminar")} title={t("prod.eliminar")}><Trash2 size={13} color="#B23B3B" /></button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pt-2 border-t text-[11px]" style={{ borderColor: "#F1EBE0", color: "#9A8F80" }}>
        {dias !== null && (
          <span className="flex items-center gap-1">
            <Clock size={11} />
            <strong style={{ color: dias > 90 ? "#B23B3B" : "#6B5B52" }}>{dias}</strong> <T k="prod.dias" />
          </span>
        )}
        {p.fechaCompra && <span className="flex items-center gap-1"><Calendar size={11} /> {fmtDate(dateStrToTs(p.fechaCompra))}</span>}
        {p.proveedor && <span className="flex items-center gap-1"><Truck size={11} /> {p.proveedor}</span>}
        {vendidas > 0 && <span className="flex items-center gap-1"><ShoppingBag size={11} /> {t("prod.vendidas", { n: vendidas })}</span>}
        {p.oculto && <span className="flex items-center gap-1" style={{ color: "var(--colorAcento)" }}><EyeOff size={11} /> <T k="prod.estadoOculto" /></span>}
        {ult && (
          <span className="flex items-center gap-1" style={{ color: "var(--colorAcento)" }}>
            <Check size={11} /> {t("prod.ultimaVenta", { fecha: fmtDateTime(ult.at) })}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <button onClick={() => onVender(p)} disabled={agotado} className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full disabled:opacity-40" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>
          <Minus size={12} /> <T k="prod.vender" enBoton />
        </button>
        <button onClick={() => onOcultar(p)} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full" style={{ background: "#F7F3EC", color: "#6B5B52" }}>
          {p.oculto ? <Eye size={12} /> : <EyeOff size={12} />} {t(p.oculto ? "prod.mostrar" : "prod.ocultar")}
        </button>
        {p.ventas.length > 0 && (
          <button onClick={() => setVerVentas((v) => !v)} className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-full" style={{ background: "#F7F3EC", color: "#6B5B52" }}>
            {t("prod.verVentas", { n: p.ventas.length })} {verVentas ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      {verVentas && p.ventas.length > 0 && (
        <div className="mt-2 rounded-lg p-2 space-y-1.5" style={{ background: "#FBF8F3" }}>
          {[...p.ventas].sort((a, b) => b.at - a.at).map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span style={{ color: "#6B5B52" }}>{fmtDateTime(v.at)} · {t("dash.ventaPiezas", { n: v.qty })} · <strong>{money((Number(v.precio) || 0) * (Number(v.qty) || 0))}</strong></span>
              <button onClick={() => onDeshacer(p, v)} className="flex items-center gap-1 px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: "#FDF4E7", color: "#B0813C" }}>
                <Undo2 size={11} /> {t("venta.deshacer")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectFiltro({ k, value, onChange, options }) {
  const { t } = useEdicion();
  return (
    <div>
      <T k={k} as="label" className="text-[10px] uppercase tracking-wide" style={{ color: "#9A8F80" }} />
      <select value={value} onChange={onChange} className={inputCls} style={inputStyle}>
        <option value="">{t("prod.filtroTodas")}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function TabButton({ active, onClick, icon, k }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm transition"
      style={active ? { background: "var(--colorBoton)", color: "var(--colorBotonTexto)" } : { background: "#fff", color: "#6B5B52", border: "1px solid #E4DDD1" }}>
      {icon} <T k={k} enBoton />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Registrar venta y deshacer venta (con PIN)
// ---------------------------------------------------------------------------
function VentaModal({ p, onCerrar, onRegistrar }) {
  const { t } = useEdicion();
  const [qty, setQty] = useState(1);
  const [precio, setPrecio] = useState(String(p.precioVenta ?? ""));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const max = p.cantidad;
  const total = (Number(precio) || 0) * qty;

  const registrar = async () => {
    if (qty < 1 || qty > max) { setError(t("venta.sinStock")); return; }
    setGuardando(true); setError("");
    try { await onRegistrar(p.id, qty, Number(precio) || 0); onCerrar(); }
    catch (e) { setError(e?.message || t("general.errorGuardar")); setGuardando(false); }
  };

  return (
    <Modal onClose={onCerrar} title={<T k="venta.titulo" />}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: "#EFE7DB" }}>
          {p.imagen ? <img src={p.imagen} alt="" className="w-full h-full object-cover" /> : <ImageOff size={16} color="#C6BBAC" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{p.nombre}</p>
          <p className="text-xs" style={{ color: "#9A8F80" }}>{[detalleDe(p), t("venta.disponibles", { n: max })].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <T k="venta.cantidad" as="span" className="text-xs" style={{ color: "#6B5B52" }} />
          <div className="flex items-center gap-2 mt-1">
            <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} className="w-10 h-10 rounded-full border flex items-center justify-center text-lg" style={{ borderColor: "#E4DDD1", background: "#fff" }}>−</button>
            <span className="w-8 text-center text-lg font-medium">{qty}</span>
            <button type="button" onClick={() => setQty((n) => Math.min(max, n + 1))} className="w-10 h-10 rounded-full border flex items-center justify-center text-lg" style={{ borderColor: "#E4DDD1", background: "#fff" }}>+</button>
          </div>
        </div>
        <Field label={<T k="venta.precio" />}>
          <input type="number" min="0" step="any" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
      </div>
      <div className="flex items-center justify-between rounded-xl px-3 py-2.5 mt-4" style={{ background: "#EFE7DB" }}>
        <T k="venta.total" as="span" className="text-xs" style={{ color: "#6B5B52" }} />
        <span className="font-display text-xl">{money(total)}</span>
      </div>
      {error && <p className="text-xs mt-2" style={{ color: "#B23B3B" }}>{error}</p>}
      <div className="flex gap-3 mt-4">
        <button type="button" onClick={onCerrar} className="flex-1 rounded-xl py-3 text-sm font-medium border" style={{ borderColor: "#E4DDD1", color: "#6B5B52" }}>{t("general.cancelar")}</button>
        <button type="button" onClick={registrar} disabled={guardando || max < 1} className="flex-1 rounded-xl py-3 text-sm font-medium disabled:opacity-60" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>
          {guardando ? t("form.guardando") : t("venta.registrar")}
        </button>
      </div>
    </Modal>
  );
}

function DeshacerModal({ p, venta, pin, onCerrar, onConfirmar }) {
  const { t } = useEdicion();
  const [pinIn, setPinIn] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const confirmar = async () => {
    if (pinIn !== pin) { setError(t("venta.errorPin")); return; }
    setGuardando(true);
    try { await onConfirmar(); }
    catch (e) { setError(e?.message || t("general.errorGuardar")); setGuardando(false); }
  };
  return (
    <Modal onClose={onCerrar} title={<T k="venta.deshacerTitulo" />}>
      <div className="rounded-xl p-3 mb-4 flex items-start gap-2.5" style={{ background: "#FDF4E7" }}>
        <ShieldCheck size={16} color="#B0813C" className="flex-shrink-0 mt-0.5" />
        <p className="text-xs" style={{ color: "#8A7F71" }}>
          {t("venta.deshacerTexto", { n: venta.qty, nombre: p.nombre, fecha: fmtDateTime(venta.at) })}
        </p>
      </div>
      <T k="venta.pedirPin" as="p" className="text-sm mb-2 block" style={{ color: "#9A8F80" }} />
      <input type="password" inputMode="numeric" autoFocus value={pinIn}
        onChange={(e) => setPinIn(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && confirmar()}
        className="w-full rounded-xl border px-4 py-3 text-center text-lg tracking-[0.4em]" style={{ borderColor: "#E4DDD1" }} placeholder="••••" />
      {error && <p className="text-xs mt-2 text-center" style={{ color: "#B23B3B" }}>{error}</p>}
      <div className="flex gap-3 mt-4">
        <button onClick={onCerrar} className="flex-1 rounded-xl py-3 text-sm font-medium border" style={{ borderColor: "#E4DDD1", color: "#6B5B52" }}>{t("general.cancelar")}</button>
        <button onClick={confirmar} disabled={guardando} className="flex-1 rounded-xl py-3 text-sm font-medium disabled:opacity-60" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>{t("general.confirmar")}</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Formulario de producto
// ---------------------------------------------------------------------------
function ProductForm({ form, setForm, formImage, onEditarFoto, onQuitarFoto, onSubmit, onCancel, saving, categorias, onAgregarCategoria, vendidas, aspecto }) {
  const { t } = useEdicion();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [nuevaCat, setNuevaCat] = useState(null);
  const [errorCat, setErrorCat] = useState("");
  const opcionesCat = form.categoria && !categorias.includes(form.categoria) ? [...categorias, form.categoria] : categorias;

  const crearCategoria = async () => {
    const nombre = (nuevaCat || "").trim();
    if (!nombre) return;
    const existente = categorias.find((c) => c.toLowerCase() === nombre.toLowerCase());
    try {
      const final = existente || await onAgregarCategoria(nombre);
      setForm((f) => ({ ...f, categoria: final }));
      setNuevaCat(null); setErrorCat("");
    } catch (e) { setErrorCat(e?.message || t("general.errorGuardar")); }
  };

  const enviar = (e) => {
    if (nuevaCat !== null) {
      e.preventDefault();
      setErrorCat("Toca «Agregar» para crear la categoría o elige una de la lista.");
      return;
    }
    onSubmit(e);
  };

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Field label={<T k="form.nombre" />}>
        <input required value={form.nombre} onChange={set("nombre")} className={inputCls} style={inputStyle} placeholder={t("form.nombrePh")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={<T k="form.categoria" />}>
          <select required value={nuevaCat !== null ? "__nueva__" : form.categoria}
            onChange={(e) => { if (e.target.value === "__nueva__") { setNuevaCat(""); } else { setNuevaCat(null); set("categoria")(e); } }}
            className={inputCls} style={inputStyle}>
            <option value="">{t("form.selecciona")}</option>
            {opcionesCat.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__nueva__">{t("form.nuevaCategoria")}</option>
          </select>
        </Field>
        <Field label={<T k="form.subcategoria" />}><input value={form.subcategoria} onChange={set("subcategoria")} className={inputCls} style={inputStyle} /></Field>
      </div>
      {nuevaCat !== null && (
        <div>
          <div className="flex gap-2">
            <input autoFocus value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); crearCategoria(); } }}
              placeholder={t("form.nuevaCategoriaPh")} className={inputCls + " mt-0"} style={inputStyle} />
            <button type="button" onClick={crearCategoria} className="px-4 rounded-xl text-sm font-medium flex-shrink-0" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>{t("form.agregarCategoria")}</button>
            <button type="button" onClick={() => { setNuevaCat(null); setErrorCat(""); }} className="px-3 rounded-xl text-sm flex-shrink-0 border" style={{ borderColor: "#E4DDD1", color: "#6B5B52" }}>×</button>
          </div>
          {errorCat && <p className="text-xs mt-1" style={{ color: "#B23B3B" }}>{errorCat}</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={<T k="form.precioVenta" />}><input required type="number" min="0" step="any" inputMode="decimal" value={form.precioVenta} onChange={set("precioVenta")} className={inputCls} style={inputStyle} placeholder="0" /></Field>
        <Field label={<T k="form.precioCompra" />}><input type="number" min="0" step="any" inputMode="decimal" value={form.precioCompra} onChange={set("precioCompra")} className={inputCls} style={inputStyle} placeholder="0" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={<T k="form.talla" />}><input value={form.talla} onChange={set("talla")} className={inputCls} style={inputStyle} placeholder={t("form.tallaPh")} /></Field>
        <Field label={<T k="form.color" />}><input value={form.color} onChange={set("color")} className={inputCls} style={inputStyle} placeholder={t("form.colorPh")} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={<T k="form.material" />}><input value={form.material} onChange={set("material")} className={inputCls} style={inputStyle} /></Field>
        <Field label={<T k="form.genero" />}><input value={form.genero} onChange={set("genero")} className={inputCls} style={inputStyle} placeholder={t("form.generoPh")} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={<T k="form.grupo" />}><input value={form.grupo} onChange={set("grupo")} className={inputCls} style={inputStyle} placeholder={t("form.grupoPh")} /></Field>
        <Field label={<T k="form.cantidad" />}><input type="number" min="0" step="1" inputMode="numeric" value={form.cantidad} onChange={set("cantidad")} className={inputCls} style={inputStyle} /></Field>
      </div>
      {vendidas > 0 && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs" style={{ background: "#EFE7DB", color: "#6B5B52" }}>
          <ShoppingBag size={13} /> {t("form.vendidas", { n: vendidas })}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={<T k="form.fechaCompra" />}><input type="date" value={form.fechaCompra || ""} onChange={set("fechaCompra")} className={inputCls} style={inputStyle} /></Field>
        <Field label={<T k="form.proveedor" />}><input value={form.proveedor || ""} onChange={set("proveedor")} className={inputCls} style={inputStyle} placeholder={t("form.proveedorPh")} /></Field>
      </div>
      {form.fechaCompra && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs" style={{ background: "#EFE7DB", color: "#6B5B52" }}>
          <Clock size={13} />
          {t("form.dias", { n: diasEnInventario({ ...form, cantidad: Number(form.cantidad) || 0, createdAt: form.createdAt || Date.now() }) })}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 items-end">
        <Field label={<T k="form.ubicacion" />}><input value={form.ubicacion} onChange={set("ubicacion")} className={inputCls} style={inputStyle} placeholder={t("form.ubicacionPh")} /></Field>
        <label className="flex items-center gap-2 text-sm rounded-xl border px-3 py-2.5 cursor-pointer" style={{ borderColor: "#E4DDD1", background: "#fff", color: "#6B5B52" }}>
          <input type="checkbox" checked={Boolean(form.oculto)} onChange={(e) => setForm((f) => ({ ...f, oculto: e.target.checked }))} style={{ accentColor: "var(--colorAcento)" }} />
          <T k="form.ocultar" />
        </label>
      </div>

      <div>
        <T k="form.foto" as="span" className="text-xs" style={{ color: "#6B5B52" }} />
        {formImage ? (
          <div className="mt-1 flex items-start gap-3">
            <div className="w-28 rounded-xl overflow-hidden flex-shrink-0" style={{ background: "#EFE7DB", aspectRatio: aspectoCss(aspecto) }}>
              <img src={formImage} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={onEditarFoto} className="text-xs px-3 py-2 rounded-xl flex items-center gap-1.5" style={{ background: "#EFE2DE", color: "#6B5B52" }}>
                <ImagePlus size={13} /> {t("form.recortar")}
              </button>
              <button type="button" onClick={onQuitarFoto} className="text-xs px-3 py-2 rounded-xl flex items-center gap-1.5" style={{ background: "#FBEAEA", color: "#B23B3B" }}>
                <Trash2 size={13} /> {t("form.quitarFoto")}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={onEditarFoto} className="mt-1 w-full rounded-xl border-2 border-dashed py-5 flex items-center justify-center gap-2 text-sm" style={{ borderColor: "#E4DDD1", color: "#6B5B52", background: "#fff" }}>
            <ImagePlus size={16} /> {t("form.elegirFoto")}
          </button>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl py-3 text-sm font-medium border" style={{ borderColor: "#E4DDD1", color: "#6B5B52" }}>{t("form.cancelar")}</button>
        <button type="submit" disabled={saving} className="flex-1 rounded-xl py-3 text-sm font-medium disabled:opacity-60" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>{saving ? t("form.guardando") : t("form.guardar")}</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Configuración de la tienda
// ---------------------------------------------------------------------------
function SettingsForm({ settings, onSave, products, onExportBackup, onImportBackup, onVaciar, onImportarPaquete }) {
  const { t } = useEdicion();
  const [local, setLocal] = useState({ nombre: settings.nombre, tagline: settings.tagline, whatsapp: settings.whatsapp, pin: settings.pin });
  const [shareUrl, setShareUrl] = useState(typeof window !== "undefined" ? window.location.href : "");
  const [copied, setCopied] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const restoreInputRef = useRef(null);
  const set = (k) => (e) => setLocal((s) => ({ ...s, [k]: e.target.value }));

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  const handleRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportMsg("");
    try { await onImportBackup(file); setImportMsg(t("config.restaurado")); }
    catch { setImportMsg(t("config.restaurarError")); }
    finally { setImporting(false); if (restoreInputRef.current) restoreInputRef.current.value = ""; }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => { e.preventDefault(); onSave(local); }} className="space-y-4">
        <Field label={<T k="config.nombre" />}><input value={local.nombre} onChange={set("nombre")} className={inputCls} style={inputStyle} /></Field>
        <Field label={<T k="config.tagline" />}><input value={local.tagline} onChange={set("tagline")} className={inputCls} style={inputStyle} /></Field>
        <Field label={<T k="config.whatsapp" />}><input value={local.whatsapp} onChange={set("whatsapp")} className={inputCls} style={inputStyle} placeholder="5215512345678" /></Field>
        <Field label={<T k="config.pin" />}><input value={local.pin} onChange={set("pin")} className={inputCls} style={inputStyle} /></Field>
        <button type="submit" className="w-full rounded-xl py-3 text-sm font-medium" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>{t("config.guardar")}</button>
      </form>

      <div className="pt-2 border-t" style={{ borderColor: "#E9E1D4" }}>
        <T k="config.compartirTitulo" as="h3" className="font-display text-lg mb-1 pt-4 block" />
        <T k="config.compartirTexto" as="p" className="text-xs mb-3 block" style={{ color: "#9A8F80" }} />
        <div className="flex gap-2 mb-3">
          <input value={shareUrl} onChange={(e) => setShareUrl(e.target.value)} className={inputCls + " mt-0"} style={inputStyle} placeholder="https://boutique-martita.vercel.app" />
          <button type="button" onClick={copyLink} className="px-4 rounded-xl text-xs flex-shrink-0" style={{ background: "#EFE2DE", color: "#6B5B52" }}>{copied ? t("config.copiado") : t("config.copiar")}</button>
        </div>
        {shareUrl && (
          <div className="flex flex-col items-center gap-2 py-3 rounded-xl" style={{ background: "#fff", border: "1px solid #E9E1D4" }}>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(shareUrl)}`} alt="Código QR del catálogo" width={180} height={180} />
            <T k="config.qrAyuda" as="p" className="text-[11px]" style={{ color: "#9A8F80" }} />
          </div>
        )}
      </div>

      <CatalogosListos importados={settings.importados} totalProductos={products.length} pin={settings.pin} onImportar={onImportarPaquete} />

      <div className="pt-2 border-t" style={{ borderColor: "#E9E1D4" }}>
        <T k="config.respaldoTitulo" as="h3" className="font-display text-lg mb-1 pt-4 block" />
        <T k="config.respaldoTexto" as="p" className="text-xs mb-3 block" style={{ color: "#9A8F80" }} />
        <button type="button" onClick={onExportBackup} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium mb-2" style={{ background: "#EFE2DE", color: "#6B5B52" }}>
          <Download size={14} /> {t("config.descargar", { n: products.length })}
        </button>
        <label className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium cursor-pointer" style={{ border: "1px solid #E4DDD1", color: "#6B5B52" }}>
          {importing ? t("config.restaurando") : t("config.restaurar")}
          <input ref={restoreInputRef} type="file" accept="application/json" onChange={handleRestoreFile} className="hidden" disabled={importing} />
        </label>
        {importMsg && <p className="text-xs mt-2 text-center" style={{ color: importMsg.startsWith("¡") ? "#4CAF50" : "#B23B3B" }}>{importMsg}</p>}
      </div>

      <VaciarCatalogo total={products.length} pin={settings.pin} onVaciar={onVaciar} />
    </div>
  );
}

// Catálogos preparados en /public/importar (se listan en index.json).
function CatalogosListos({ importados, totalProductos, pin, onImportar }) {
  const [paquetes, setPaquetes] = useState(null);
  useEffect(() => {
    let vivo = true;
    fetch(PAQUETES_URL, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((lista) => { if (vivo) setPaquetes(Array.isArray(lista) ? lista : []); })
      .catch(() => { if (vivo) setPaquetes([]); });
    return () => { vivo = false; };
  }, []);
  if (!paquetes || paquetes.length === 0) return null;
  return (
    <div className="pt-2 border-t" style={{ borderColor: "#E9E1D4" }}>
      <T k="config.importarTitulo" as="h3" className="font-display text-lg mb-1 pt-4 block" />
      <T k="config.importarTexto" as="p" className="text-xs mb-3 block" style={{ color: "#9A8F80" }} />
      <div className="space-y-2">
        {paquetes.map((pq) => (
          <PaqueteImportable key={pq.id} pq={pq} fecha={importados?.[pq.id]} totalProductos={totalProductos} pin={pin} onImportar={onImportar} />
        ))}
      </div>
    </div>
  );
}

function PaqueteImportable({ pq, fecha, totalProductos, pin, onImportar }) {
  const { t } = useEdicion();
  const [reemplazar, setReemplazar] = useState(totalProductos > 0);
  const [pinIn, setPinIn] = useState("");
  const [estado, setEstado] = useState("");
  const [progreso, setProgreso] = useState(null);
  const [msg, setMsg] = useState("");
  const pedirPin = reemplazar && totalProductos > 0;

  const correr = async () => {
    if (pedirPin && pinIn !== pin) { setMsg(t("venta.errorPin")); return; }
    setEstado("corriendo"); setMsg("");
    try {
      const n = await onImportar(pq, { reemplazar: pedirPin, onProgreso: (i, total) => setProgreso({ i, n: total }) });
      setEstado("ok"); setMsg(t("config.importadoOk", { n })); setPinIn("");
    } catch (e) {
      console.error(e);
      setEstado(""); setMsg(e?.message || t("general.errorGuardar"));
    }
  };

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "#E9E1D4", background: "#fff" }}>
      <div className="flex items-center gap-3">
        {pq.portada && <img src={pq.portada} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-medium">{pq.nombre}</p>
          <p className="text-[11px]" style={{ color: "#9A8F80" }}>
            {pq.productos} productos{pq.detalle ? ` · ${pq.detalle}` : ""}{fecha ? ` · ${t("config.importado", { fecha: fmtDate(fecha) })}` : ""}
          </p>
        </div>
      </div>
      {totalProductos > 0 && (
        <label className="flex items-start gap-2 text-xs mt-3 cursor-pointer" style={{ color: "#6B5B52" }}>
          <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} className="mt-0.5" style={{ accentColor: "var(--colorAcento)" }} />
          <T k="config.importarReemplazar" />
        </label>
      )}
      {pedirPin && (
        <input type="password" inputMode="numeric" value={pinIn} onChange={(e) => setPinIn(e.target.value)}
          placeholder={t("config.pinConfirmar")} className={inputCls} style={inputStyle} />
      )}
      <button type="button" onClick={correr} disabled={estado === "corriendo"}
        className="w-full mt-3 rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-70" style={{ background: "var(--colorBoton)", color: "var(--colorBotonTexto)" }}>
        <FileUp size={14} />
        {estado === "corriendo"
          ? t("config.importando", { i: progreso?.i || 0, n: progreso?.n || pq.productos })
          : t("config.importarBoton", { n: pq.productos })}
      </button>
      {msg && <p className="text-xs mt-2 text-center" style={{ color: estado === "ok" ? "#2F8542" : "#B23B3B" }}>{msg}</p>}
    </div>
  );
}

function VaciarCatalogo({ total, pin, onVaciar }) {
  const { t } = useEdicion();
  const [abierto, setAbierto] = useState(false);
  const [pinIn, setPinIn] = useState("");
  const [estado, setEstado] = useState("");
  const [msg, setMsg] = useState("");

  const vaciar = async () => {
    if (pinIn !== pin) { setMsg(t("venta.errorPin")); return; }
    setEstado("corriendo"); setMsg("");
    try { await onVaciar(); setEstado("ok"); setMsg(t("config.vaciado")); setAbierto(false); setPinIn(""); }
    catch (e) { console.error(e); setEstado(""); setMsg(e?.message || t("general.errorGuardar")); }
  };

  return (
    <div className="pt-2 border-t" style={{ borderColor: "#E9E1D4" }}>
      <T k="config.vaciarTitulo" as="h3" className="font-display text-lg mb-1 pt-4 block" />
      <T k="config.vaciarTexto" as="p" className="text-xs mb-3 block" style={{ color: "#9A8F80" }} />
      {!abierto ? (
        <button type="button" onClick={() => { setAbierto(true); setMsg(""); }} disabled={total === 0}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium disabled:opacity-50" style={{ background: "#FBEAEA", color: "#B23B3B" }}>
          <Trash2 size={14} /> {t("config.vaciarBoton", { n: total })}
        </button>
      ) : (
        <div className="rounded-xl p-3 space-y-2" style={{ background: "#FBEAEA" }}>
          <input type="password" inputMode="numeric" autoFocus value={pinIn} onChange={(e) => setPinIn(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && vaciar()}
            placeholder={t("config.pinConfirmar")} className={inputCls + " mt-0"} style={inputStyle} />
          <div className="flex gap-2">
            <button type="button" onClick={() => { setAbierto(false); setPinIn(""); setMsg(""); }} className="flex-1 rounded-xl py-2.5 text-sm border" style={{ borderColor: "#E4DDD1", color: "#6B5B52", background: "#fff" }}>{t("general.cancelar")}</button>
            <button type="button" onClick={vaciar} disabled={estado === "corriendo"} className="flex-1 rounded-xl py-2.5 text-sm font-medium disabled:opacity-60" style={{ background: "#B23B3B", color: "#fff" }}>
              {estado === "corriendo" ? t("config.vaciando") : t("general.confirmar")}
            </button>
          </div>
        </div>
      )}
      {msg && <p className="text-xs mt-2 text-center" style={{ color: estado === "ok" ? "#2F8542" : "#B23B3B" }}>{msg}</p>}
    </div>
  );
}
