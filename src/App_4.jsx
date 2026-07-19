import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, Plus, X, Trash2, Pencil, Download, Lock, Unlock,
  ShoppingBag, LayoutDashboard, Settings, ImageOff,
  Package, DollarSign, TrendingUp, Send, Check, MapPin, Info,
  Filter, Calendar, Clock, Truck, Tag, BarChart3, ShieldCheck, RotateCcw,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, getDocs,
} from "firebase/firestore";
import { db } from "./firebase";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const CATEGORIES = [
  "Pantalón", "Jeans", "Short", "Falda", "Vestido", "Blusa", "Playera",
  "Camisa", "Polo", "Sudadera", "Suéter", "Cárdigan", "Chamarra",
  "Accesorios", "Calzado",
];

const EMPTY_PRODUCT = {
  nombre: "", categoria: "", subcategoria: "", color: "", talla: "",
  material: "", genero: "", grupo: "", precioVenta: "", precioCompra: "", cantidad: 1,
  ubicacion: "", imagen: null, disponible: true,
  fechaCompra: "", proveedor: "", vendidaAt: null,
};

const PRODUCTS_COL = collection(db, "products");
const SETTINGS_DOC = doc(db, "settings", "store");

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function compressImage(file, maxWidth = 700, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
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

// Días que la pieza lleva (o llevó) en inventario
function diasEnInventario(p) {
  const inicio = dateStrToTs(p.fechaCompra) || p.createdAt;
  if (!inicio) return null;
  const fin = p.disponible === false ? (p.vendidaAt || Date.now()) : Date.now();
  return Math.max(0, Math.floor((fin - inicio) / DAY_MS));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
      <path d="M25 16 C34 9, 44 13, 42 23 C41 29, 33 29, 25 23 Z" fill="#B25C6B" opacity="0.9" />
      <path d="M25 25 C33 23, 40 27, 38 34 C37 39, 30 38, 25 32 Z" fill="#B25C6B" opacity="0.7" />
      <ellipse cx="24" cy="24" rx="1.5" ry="10" fill="#2B2320" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connError, setConnError] = useState(false);

  const [mode, setMode] = useState("cliente"); // cliente | admin
  const [pinModal, setPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  const [settings, setSettings] = useState({ nombre: "Boutique Martita", tagline: "Bazar de ropa bonita", whatsapp: "", pin: "1234" });
  const [showSettings, setShowSettings] = useState(false);

  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState("Todas");

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  const [unsellTarget, setUnsellTarget] = useState(null);
  const [unsellPin, setUnsellPin] = useState("");
  const [unsellError, setUnsellError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [formImage, setFormImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  // -------------------------------------------------------------------
  // Suscripción en tiempo real a Firestore
  // -------------------------------------------------------------------
  useEffect(() => {
    const unsubProducts = onSnapshot(
      PRODUCTS_COL,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setProducts(list);
        setLoading(false);
        setConnError(false);
      },
      () => { setConnError(true); setLoading(false); }
    );

    const unsubSettings = onSnapshot(
      SETTINGS_DOC,
      (snap) => { if (snap.exists()) setSettings((s) => ({ ...s, ...snap.data() })); },
      () => { /* usar valores por defecto */ }
    );

    return () => { unsubProducts(); unsubSettings(); };
  }, []);

  const saveSettings = async (next) => {
    try { await setDoc(SETTINGS_DOC, next, { merge: true }); }
    catch { /* best effort */ }
  };

  // -------------------------------------------------------------------
  // Filtro inteligente
  // -------------------------------------------------------------------
  const filtered = useMemo(() => {
    const terms = query.toLowerCase().split(/[\s+]+/).filter(Boolean);
    return products.filter((p) => {
      if (p.disponible === false) return false;
      if (activeCat !== "Todas" && p.categoria !== activeCat) return false;
      if (terms.length === 0) return true;
      const hay = [p.nombre, p.categoria, p.subcategoria, p.color, p.talla, p.material, p.genero]
        .join(" ").toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [products, query, activeCat]);

  // -------------------------------------------------------------------
  // Carrito
  // -------------------------------------------------------------------
  const addToCart = (product) => {
    setCart((c) => {
      const existing = c.find((i) => i.id === product.id);
      if (existing) return c.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...c, { id: product.id, nombre: product.nombre, precioVenta: product.precioVenta, qty: 1 }];
    });
  };
  const updateQty = (id, delta) => {
    setCart((c) => c
      .map((i) => i.id === id ? { ...i, qty: i.qty + delta } : i)
      .filter((i) => i.qty > 0));
  };
  const cartTotal = cart.reduce((s, i) => s + (Number(i.precioVenta) || 0) * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const sendOrderWhatsApp = () => {
    const lines = cart.map((i) => `• ${i.qty}x ${i.nombre} — ${money(i.precioVenta * i.qty)}`);
    const text = `¡Hola! Quisiera este pedido de ${settings.nombre}:\n\n${lines.join("\n")}\n\nTotal: ${money(cartTotal)} (${cartCount} artículo${cartCount !== 1 ? "s" : ""})`;
    const phone = (settings.whatsapp || "").replace(/\D/g, "");
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  // -------------------------------------------------------------------
  // Admin: PIN
  // -------------------------------------------------------------------
  const tryEnterAdmin = () => {
    if (pinInput === settings.pin) { setMode("admin"); setPinModal(false); setPinInput(""); setPinError(""); }
    else setPinError("PIN incorrecto");
  };

  // -------------------------------------------------------------------
  // Admin: formulario de producto
  // -------------------------------------------------------------------
  const openNewForm = () => { setForm(EMPTY_PRODUCT); setFormImage(null); setEditingId(null); setFormOpen(true); };
  const openEditForm = (p) => { setForm({ ...EMPTY_PRODUCT, ...p }); setFormImage(p.imagen || null); setEditingId(p.id); setFormOpen(true); };
  const closeForm = () => setFormOpen(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setFormImage(await compressImage(file)); } catch { /* ignore */ }
  };

  const submitForm = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.categoria) return;
    setSaving(true);
    const id = editingId || uid();
    const record = {
      ...form,
      precioVenta: Number(form.precioVenta) || 0,
      precioCompra: Number(form.precioCompra) || 0,
      cantidad: Number(form.cantidad) || 1,
      imagen: formImage || null,
      createdAt: form.createdAt || Date.now(),
      vendidaAt: form.disponible === false ? (form.vendidaAt || Date.now()) : null,
    };
    try {
      await setDoc(doc(db, "products", id), record);
    } catch {
      setConnError(true);
    }
    setSaving(false);
    setFormOpen(false);
  };

  const deleteProduct = async (id) => {
    try { await deleteDoc(doc(db, "products", id)); } catch { setConnError(true); }
  };

  // Marcar como vendida guarda fecha y hora. Revertir a disponible exige el PIN.
  const toggleAvailable = async (id) => {
    const target = products.find((p) => p.id === id);
    if (!target) return;
    const estaDisponible = target.disponible !== false;
    if (estaDisponible) {
      try { await setDoc(doc(db, "products", id), { ...target, disponible: false, vendidaAt: Date.now() }); }
      catch { setConnError(true); }
    } else {
      setUnsellTarget(target);
      setUnsellPin("");
      setUnsellError("");
    }
  };

  const confirmUnsell = async () => {
    if (unsellPin !== settings.pin) { setUnsellError("Contraseña incorrecta"); return; }
    try { await setDoc(doc(db, "products", unsellTarget.id), { ...unsellTarget, disponible: true, vendidaAt: null }); }
    catch { setConnError(true); }
    setUnsellTarget(null); setUnsellPin(""); setUnsellError("");
  };

  // -------------------------------------------------------------------
  // Dashboard
  // -------------------------------------------------------------------
  const stats = useMemo(() => {
    const totalArticulos = products.reduce((s, p) => s + (Number(p.cantidad) || 1), 0);
    const valorCosto = products.reduce((s, p) => s + (Number(p.precioCompra) || 0) * (Number(p.cantidad) || 1), 0);
    const valorVenta = products.reduce((s, p) => s + (Number(p.precioVenta) || 0) * (Number(p.cantidad) || 1), 0);
    const porCategoria = {};
    products.forEach((p) => {
      const c = p.categoria || "Sin categoría";
      if (!porCategoria[c]) porCategoria[c] = { count: 0, valor: 0 };
      porCategoria[c].count += Number(p.cantidad) || 1;
      porCategoria[c].valor += (Number(p.precioVenta) || 0) * (Number(p.cantidad) || 1);
    });
    return { totalArticulos, valorCosto, valorVenta, porCategoria, ganancia: valorVenta - valorCosto };
  }, [products]);

  const exportExcel = () => {
    const rows = products.map((p) => ({
      Nombre: p.nombre, Categoría: p.categoria, Subcategoría: p.subcategoria,
      Color: p.color, Talla: p.talla, Material: p.material, Género: p.genero, Grupo: p.grupo,
      Cantidad: p.cantidad, "Precio compra": p.precioCompra, "Precio venta": p.precioVenta,
      "Valor inventario (costo)": (Number(p.precioCompra) || 0) * (Number(p.cantidad) || 1),
      "Valor inventario (venta)": (Number(p.precioVenta) || 0) * (Number(p.cantidad) || 1),
      Ubicación: p.ubicacion,
      Proveedor: p.proveedor,
      "Fecha de compra": p.fechaCompra || "",
      "Días en inventario": diasEnInventario(p) ?? "",
      Estado: p.disponible === false ? "Vendida" : "Disponible",
      "Vendida el": p.disponible === false ? fmtDateTime(p.vendidaAt) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    XLSX.writeFile(wb, `inventario-${settings.nombre.replace(/\s+/g, "_")}.xlsx`);
  };

  // -------------------------------------------------------------------
  // Respaldo completo (lee directo de Firestore, incluye fotos)
  // -------------------------------------------------------------------
  const exportBackup = async () => {
    const snap = await getDocs(PRODUCTS_COL);
    const allProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const backup = { version: 2, fecha: new Date().toISOString(), settings, products: allProducts };
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `respaldo-${settings.nombre.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (file) => {
    const text = await file.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error("Archivo inválido"); }
    if (!data.products) throw new Error("El archivo no tiene el formato esperado");
    await Promise.all(data.products.map((p) => setDoc(doc(db, "products", p.id || uid()), p)));
    if (data.settings) await saveSettings(data.settings);
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div className="font-body min-h-screen" style={{ background: "#F7F3EC", color: "#2B2320" }}>
      <BrandStyles />

      <header className="sticky top-0 z-30 backdrop-blur-md border-b" style={{ background: "#F7F3ECEE", borderColor: "#E4DDD1" }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#EFE2DE" }}>
              <ButterflyIcon size={24} />
            </div>
            <div>
              <h1 className="font-display text-2xl leading-tight">{settings.nombre}</h1>
              <p className="text-[11px] tracking-widest uppercase" style={{ color: "#9A8F80" }}>{settings.tagline}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode === "admin" && (
              <button onClick={() => setShowSettings(true)} className="w-9 h-9 rounded-full flex items-center justify-center hover:opacity-70 transition" style={{ background: "#EFE2DE" }} aria-label="Configuración">
                <Settings size={16} color="#6B5B52" />
              </button>
            )}
            <button
              onClick={() => mode === "admin" ? setMode("cliente") : setPinModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition"
              style={mode === "admin" ? { background: "#2B2320", color: "#F7F3EC" } : { background: "#EFE2DE", color: "#6B5B52" }}
            >
              {mode === "admin" ? <Unlock size={13} /> : <Lock size={13} />}
              {mode === "admin" ? "Modo tienda" : "Administradora"}
            </button>
          </div>
        </div>
      </header>

      {connError && (
        <div className="max-w-5xl mx-auto px-4 pt-3">
          <div className="text-xs rounded-lg px-3 py-2" style={{ background: "#FBEAEA", color: "#9C3B3B" }}>
            No se pudo conectar con la base de datos. Revisa tu conexión a internet e intenta recargar la página.
          </div>
        </div>
      )}

      {mode === "cliente" ? (
        <ClienteView
          products={filtered} query={query} setQuery={setQuery}
          activeCat={activeCat} setActiveCat={setActiveCat}
          onAdd={addToCart} loading={loading} total={products.length}
        />
      ) : (
        <AdminView
          products={products} stats={stats} settings={settings}
          onNew={openNewForm} onEdit={openEditForm} onDelete={deleteProduct}
          onToggleAvailable={toggleAvailable}
          onExport={exportExcel} loading={loading}
        />
      )}

      {mode === "cliente" && cartCount > 0 && (
        <button onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-4 right-4 max-w-5xl mx-auto rounded-2xl shadow-xl px-5 py-4 flex items-center justify-between z-40"
          style={{ background: "#2B2320", color: "#F7F3EC" }}>
          <span className="flex items-center gap-2 text-sm font-medium"><ShoppingBag size={18} />{cartCount} artículo{cartCount !== 1 ? "s" : ""}</span>
          <span className="font-display text-lg">{money(cartTotal)}</span>
        </button>
      )}

      {cartOpen && (
        <Modal onClose={() => setCartOpen(false)} title="Tu pedido">
          {cart.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "#9A8F80" }}>Tu pedido está vacío.</p>
          ) : (
            <div className="space-y-3">
              {cart.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 py-2 border-b" style={{ borderColor: "#EFE7DB" }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{i.nombre}</p>
                    <p className="text-xs" style={{ color: "#9A8F80" }}>{money(i.precioVenta)} c/u</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => updateQty(i.id, -1)} className="w-7 h-7 rounded-full border flex items-center justify-center" style={{ borderColor: "#E4DDD1" }}>−</button>
                    <span className="w-5 text-center text-sm">{i.qty}</span>
                    <button onClick={() => updateQty(i.id, 1)} className="w-7 h-7 rounded-full border flex items-center justify-center" style={{ borderColor: "#E4DDD1" }}>+</button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2">
                <span className="font-medium text-sm">Total ({cartCount} artículo{cartCount !== 1 ? "s" : ""})</span>
                <span className="font-display text-xl">{money(cartTotal)}</span>
              </div>
              <button onClick={sendOrderWhatsApp} className="w-full mt-2 rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-medium" style={{ background: "#25D366", color: "#fff" }}>
                <Send size={15} /> Enviar pedido por WhatsApp
              </button>
            </div>
          )}
        </Modal>
      )}

      {unsellTarget && (
        <Modal onClose={() => { setUnsellTarget(null); setUnsellPin(""); setUnsellError(""); }} title="Confirmar cambio">
          <div className="rounded-xl p-3 mb-4 flex items-start gap-2.5" style={{ background: "#FDF4E7" }}>
            <ShieldCheck size={16} color="#B0813C" className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Regresar a disponible</p>
              <p className="text-xs mt-0.5" style={{ color: "#8A7F71" }}>
                "{unsellTarget.nombre}" se marcó como vendida el {fmtDateTime(unsellTarget.vendidaAt)}. Al revertirla se borrará ese registro de venta.
              </p>
            </div>
          </div>
          <p className="text-sm mb-2" style={{ color: "#9A8F80" }}>Ingresa la contraseña de administradora para confirmar.</p>
          <input type="password" inputMode="numeric" autoFocus value={unsellPin}
            onChange={(e) => setUnsellPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmUnsell()}
            className="w-full rounded-xl border px-4 py-3 text-center text-lg tracking-[0.4em]" style={{ borderColor: "#E4DDD1" }} placeholder="••••" />
          {unsellError && <p className="text-xs mt-2 text-center" style={{ color: "#B23B3B" }}>{unsellError}</p>}
          <div className="flex gap-3 mt-4">
            <button onClick={() => { setUnsellTarget(null); setUnsellPin(""); setUnsellError(""); }} className="flex-1 rounded-xl py-3 text-sm font-medium border" style={{ borderColor: "#E4DDD1", color: "#6B5B52" }}>Cancelar</button>
            <button onClick={confirmUnsell} className="flex-1 rounded-xl py-3 text-sm font-medium" style={{ background: "#2B2320", color: "#F7F3EC" }}>Confirmar</button>
          </div>
        </Modal>
      )}

      {pinModal && (
        <Modal onClose={() => { setPinModal(false); setPinInput(""); setPinError(""); }} title="Acceso administradora">
          <p className="text-sm mb-4" style={{ color: "#9A8F80" }}>Ingresa tu PIN para agregar o editar productos.</p>
          <input type="password" inputMode="numeric" autoFocus value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryEnterAdmin()}
            className="w-full rounded-xl border px-4 py-3 text-center text-lg tracking-[0.4em]" style={{ borderColor: "#E4DDD1" }} placeholder="••••" />
          {pinError && <p className="text-xs mt-2 text-center" style={{ color: "#B23B3B" }}>{pinError}</p>}
          <button onClick={tryEnterAdmin} className="w-full mt-4 rounded-xl py-3 text-sm font-medium" style={{ background: "#2B2320", color: "#F7F3EC" }}>Entrar</button>
          <p className="text-[11px] mt-3 text-center" style={{ color: "#B7ACA0" }}>PIN de prueba: 1234 (cámbialo en Configuración)</p>
        </Modal>
      )}

      {showSettings && (
        <Modal onClose={() => setShowSettings(false)} title="Configuración de la tienda">
          <SettingsForm settings={settings} onSave={async (next) => { setSettings(next); await saveSettings(next); setShowSettings(false); }}
            products={products} onExportBackup={exportBackup} onImportBackup={importBackup} />
        </Modal>
      )}

      {formOpen && (
        <Modal onClose={closeForm} title={editingId ? "Editar producto" : "Agregar producto nuevo"} wide>
          <ProductForm form={form} setForm={setForm} formImage={formImage} onFile={handleFile}
            onSubmit={submitForm} onCancel={closeForm} saving={saving} fileInputRef={fileInputRef} />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vista cliente
// ---------------------------------------------------------------------------
function ClienteView({ products, query, setQuery, activeCat, setActiveCat, onAdd, loading, total }) {
  return (
    <main className="max-w-5xl mx-auto px-4 pb-32">
      <div className="pt-6 pb-2">
        <p className="text-sm mb-2" style={{ color: "#6B5B52" }}>¿Qué estás buscando?</p>
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" color="#B7ACA0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="playera + azul + talla M"
            className="w-full rounded-full border pl-11 pr-4 py-3 text-sm outline-none focus:ring-2" style={{ borderColor: "#E4DDD1", background: "#fff" }} />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none py-3 -mx-4 px-4">
        {["Todas", ...CATEGORIES].map((c) => (
          <button key={c} onClick={() => setActiveCat(c)} className="flex-shrink-0 px-4 py-2 rounded-full text-sm border transition"
            style={activeCat === c ? { background: "#2B2320", color: "#F7F3EC", borderColor: "#2B2320" } : { background: "#fff", color: "#6B5B52", borderColor: "#E4DDD1" }}>
            {c}
          </button>
        ))}
      </div>

      <div className="pt-4 pb-2">
        <h2 className="font-display text-3xl">Piezas sencillas, bien elegidas.</h2>
        <p className="text-sm mt-1" style={{ color: "#9A8F80" }}>Catálogo de ropa, calzado y accesorios.</p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm" style={{ color: "#B7ACA0" }}>Cargando catálogo…</div>
      ) : total === 0 ? (
        <EmptyState text="Aún no hay productos en el catálogo." />
      ) : products.length === 0 ? (
        <EmptyState text="No encontramos nada con esa búsqueda." />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4">
          {products.map((p) => <ProductCard key={p.id} p={p} onAdd={() => onAdd(p)} />)}
        </div>
      )}
    </main>
  );
}

function ProductCard({ p, onAdd }) {
  const [added, setAdded] = useState(false);
  const [showLoc, setShowLoc] = useState(false);
  return (
    <div className="rounded-2xl overflow-hidden border flex flex-col" style={{ borderColor: "#E9E1D4", background: "#fff" }}>
      <div className="relative aspect-[3/4] flex items-center justify-center" style={{ background: "#EFE7DB" }}>
        {p.imagen ? <img src={p.imagen} alt={p.nombre} className="w-full h-full object-cover" /> : <ImageOff size={22} color="#C6BBAC" />}
        {p.ubicacion && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setShowLoc((v) => !v); }}
              className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition hover:scale-110"
              style={{ background: "rgba(255,255,255,0.75)", backdropFilter: "blur(2px)" }}
              aria-label="Ver información" title="Información"
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
                  <p className="text-[9px] tracking-widest uppercase" style={{ color: "#B25C6B" }}>Ubicación</p>
                  <p className="text-xs font-medium mt-0.5" style={{ color: "#2B2320" }}>{p.ubicacion}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="p-3 flex flex-col flex-1">
        <p className="text-[10px] tracking-widest uppercase" style={{ color: "#B25C6B" }}>{p.categoria}</p>
        <p className="text-sm font-medium leading-snug mt-0.5 line-clamp-2">{p.nombre}</p>
        {(p.talla || p.color) && <p className="text-[11px] mt-0.5" style={{ color: "#9A8F80" }}>{[p.talla, p.color].filter(Boolean).join(" · ")}</p>}
        {(p.material || p.grupo) && <p className="text-[11px]" style={{ color: "#B7ACA0" }}>{[p.material, p.grupo].filter(Boolean).join(" · ")}</p>}
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="font-display text-2xl leading-none" style={{ color: "#2B2320" }}>{money(p.precioVenta)}</span>
          <button onClick={() => { onAdd(); setAdded(true); setTimeout(() => setAdded(false), 1200); }}
            className="w-8 h-8 rounded-full flex items-center justify-center transition"
            style={added ? { background: "#4CAF50", color: "#fff" } : { background: "#2B2320", color: "#F7F3EC" }} aria-label="Agregar al pedido">
            {added ? <Check size={15} /> : <Plus size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="py-16 text-center"><p className="font-display text-xl" style={{ color: "#9A8F80" }}>{text}</p></div>;
}

// ---------------------------------------------------------------------------
// Vista administradora
// ---------------------------------------------------------------------------
function AdminView({ products, stats, settings, onNew, onEdit, onDelete, onToggleAvailable, onExport, loading }) {
  const [tab, setTab] = useState("dashboard");
  return (
    <main className="max-w-5xl mx-auto px-4 pb-16">
      <div className="flex gap-2 pt-6">
        <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={<LayoutDashboard size={14} />} label="Dashboard" />
        <TabButton active={tab === "productos"} onClick={() => setTab("productos")} icon={<Package size={14} />} label="Productos" />
      </div>

      {tab === "dashboard"
        ? <Dashboard products={products} onExport={onExport} />
        : <ProductosTab products={products} loading={loading} onNew={onNew} onEdit={onEdit} onDelete={onDelete} onToggleAvailable={onToggleAvailable} />}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function Dashboard({ products, onExport }) {
  const hoy = new Date();
  const hace30 = new Date(hoy.getTime() - 29 * DAY_MS);
  const [desde, setDesde] = useState(tsToDateStr(hace30.getTime()));
  const [hasta, setHasta] = useState(tsToDateStr(hoy.getTime()));

  const d = useMemo(() => {
    const pzs = (p) => Number(p.cantidad) || 1;
    const disponibles = products.filter((p) => p.disponible !== false);
    const vendidas = products.filter((p) => p.disponible === false);

    const totalPiezas = disponibles.reduce((s, p) => s + pzs(p), 0);
    const inversion = disponibles.reduce((s, p) => s + (Number(p.precioCompra) || 0) * pzs(p), 0);
    const valorVenta = disponibles.reduce((s, p) => s + (Number(p.precioVenta) || 0) * pzs(p), 0);
    const totalVentas = vendidas.reduce((s, p) => s + (Number(p.precioVenta) || 0) * pzs(p), 0);
    const piezasVendidas = vendidas.reduce((s, p) => s + pzs(p), 0);

    const agrupar = (lista, campo, fallback) => {
      const map = {};
      lista.forEach((p) => {
        const k = (p[campo] || "").trim() || fallback;
        if (!map[k]) map[k] = { piezas: 0, inversion: 0, venta: 0 };
        map[k].piezas += pzs(p);
        map[k].inversion += (Number(p.precioCompra) || 0) * pzs(p);
        map[k].venta += (Number(p.precioVenta) || 0) * pzs(p);
      });
      return Object.entries(map)
        .map(([nombre, v]) => ({ nombre, ...v, utilidad: v.venta - v.inversion }))
        .sort((a, b) => b.venta - a.venta);
    };

    return {
      totalPiezas, inversion, valorVenta, totalVentas, piezasVendidas,
      porCategoria: agrupar(disponibles, "categoria", "Sin categoría"),
      porGrupo: agrupar(disponibles, "grupo", "Sin temporada"),
      vendidas,
    };
  }, [products]);

  // ----- Reporte de ventas filtrado por fechas -----
  const reporte = useMemo(() => {
    const tsDesde = dateStrToTs(desde);
    const tsHasta = dateStrToTs(hasta);
    const iniDia = tsDesde ? new Date(tsDesde).setHours(0, 0, 0, 0) : -Infinity;
    const finDia = tsHasta ? new Date(tsHasta).setHours(23, 59, 59, 999) : Infinity;

    const ventas = d.vendidas
      .filter((p) => p.vendidaAt && p.vendidaAt >= iniDia && p.vendidaAt <= finDia)
      .sort((a, b) => b.vendidaAt - a.vendidaAt);

    const pzs = (p) => Number(p.cantidad) || 1;
    const total = ventas.reduce((s, p) => s + (Number(p.precioVenta) || 0) * pzs(p), 0);
    const costo = ventas.reduce((s, p) => s + (Number(p.precioCompra) || 0) * pzs(p), 0);
    const piezas = ventas.reduce((s, p) => s + pzs(p), 0);

    // Serie diaria para la gráfica
    const dias = [];
    if (isFinite(iniDia) && isFinite(finDia) && finDia >= iniDia) {
      const nDias = Math.min(62, Math.round((finDia - iniDia) / DAY_MS) + 1);
      for (let i = 0; i < nDias; i++) {
        const dia = new Date(iniDia + i * DAY_MS);
        const ini = new Date(dia).setHours(0, 0, 0, 0);
        const fin = new Date(dia).setHours(23, 59, 59, 999);
        const monto = ventas
          .filter((p) => p.vendidaAt >= ini && p.vendidaAt <= fin)
          .reduce((s, p) => s + (Number(p.precioVenta) || 0) * pzs(p), 0);
        dias.push({
          etiqueta: dia.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", ""),
          fecha: dia.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" }),
          monto,
        });
      }
    }
    return { ventas, total, costo, piezas, utilidad: total - costo, dias };
  }, [d.vendidas, desde, hasta]);

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
        <KpiCard icon={<Package size={18} />} label="Total de artículos" value={d.totalPiezas} sub="Piezas en inventario" />
        <KpiCard icon={<DollarSign size={18} />} label="Inversión en inventario" value={money(d.inversion)} sub="Capital invertido" />
        <KpiCard icon={<Tag size={18} />} label="Valor de inventario" value={money(d.valorVenta)} sub="Valor estimado actual" />
        <KpiCard icon={<ShoppingBag size={18} />} label="Total de ventas" value={money(d.totalVentas)}
          sub={<>Artículos vendidos: <strong style={{ color: "#B25C6B" }}>{d.piezasVendidas}</strong></>} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Inventario por categoría */}
        <Panel title="Inventario por categoría" action={
          <button onClick={onExport} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{ background: "#EFE2DE", color: "#6B5B52" }}>
            <Download size={12} /> Excel
          </button>
        }>
          {d.porCategoria.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: "#B7ACA0" }}>Agrega productos para ver estadísticas.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: "#9A8F80" }}>
                    <th className="text-left font-medium pb-2 px-1">Categoría</th>
                    <th className="text-right font-medium pb-2 px-1">Piezas</th>
                    <th className="text-right font-medium pb-2 px-1">Inversión</th>
                    <th className="text-right font-medium pb-2 px-1">Valor venta</th>
                    <th className="text-right font-medium pb-2 px-1">Utilidad</th>
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
            <Package size={13} /> Total de piezas en inventario: <strong style={{ color: "#B25C6B" }}>{d.totalPiezas}</strong>
          </div>
        </Panel>

        {/* Temporalidad */}
        <Panel title="Temporalidad" icon={<Tag size={15} color="#B25C6B" />}>
          {d.porGrupo.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm" style={{ color: "#B7ACA0" }}>Cada temporada trae nuevas oportunidades para brillar.</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "#9A8F80" }}>
                  <th className="text-left font-medium pb-2 px-1">Temporada</th>
                  <th className="text-right font-medium pb-2 px-1">Piezas</th>
                  <th className="text-right font-medium pb-2 px-1">Valor venta</th>
                  <th className="text-right font-medium pb-2 px-1">Utilidad</th>
                </tr>
              </thead>
              <tbody>
                {d.porGrupo.map((g) => (
                  <tr key={g.nombre} className="border-t" style={{ borderColor: "#F1EBE0" }}>
                    <td className="py-2.5 px-1 font-medium">{g.nombre}</td>
                    <td className="py-2.5 px-1 text-right" style={{ color: "#6B5B52" }}>{g.piezas}</td>
                    <td className="py-2.5 px-1 text-right" style={{ color: "#B25C6B" }}>{money(g.venta)}</td>
                    <td className="py-2.5 px-1 text-right font-medium" style={{ color: g.utilidad >= 0 ? "#2F8542" : "#B23B3B" }}>{money(g.utilidad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {/* Reporte de ventas */}
      <Panel title="Reporte de ventas" icon={<BarChart3 size={15} color="#B25C6B" />}>
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div>
            <label className="text-[10px] uppercase tracking-wide" style={{ color: "#9A8F80" }}>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="block rounded-lg border px-2.5 py-1.5 text-xs mt-0.5" style={{ borderColor: "#E4DDD1", background: "#fff" }} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide" style={{ color: "#9A8F80" }}>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="block rounded-lg border px-2.5 py-1.5 text-xs mt-0.5" style={{ borderColor: "#E4DDD1", background: "#fff" }} />
          </div>
          <div className="flex gap-1.5">
            {[["7 días", 7], ["30 días", 30], ["90 días", 90]].map(([txt, n]) => (
              <button key={n} onClick={() => rangoRapido(n)} className="text-[11px] px-2.5 py-1.5 rounded-full" style={{ background: "#EFE2DE", color: "#6B5B52" }}>{txt}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <MiniStat label="Total de ventas" value={money(reporte.total)} big />
          <MiniStat label="Piezas vendidas" value={reporte.piezas} />
          <MiniStat label="Utilidad" value={money(reporte.utilidad)} color={reporte.utilidad >= 0 ? "#2F8542" : "#B23B3B"} />
        </div>

        <SalesChart dias={reporte.dias} />

        {reporte.ventas.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: "#B7ACA0" }}>No hay ventas registradas en este rango de fechas.</p>
        ) : (
          <div className="mt-4 border-t pt-3" style={{ borderColor: "#F1EBE0" }}>
            <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "#9A8F80" }}>Detalle ({reporte.ventas.length})</p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {reporte.ventas.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 text-xs py-1.5 border-b last:border-0" style={{ borderColor: "#F7F3EC" }}>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{v.nombre}</p>
                    <p style={{ color: "#9A8F80" }}>{fmtDateTime(v.vendidaAt)}</p>
                  </div>
                  <span className="font-medium flex-shrink-0" style={{ color: "#B25C6B" }}>{money((Number(v.precioVenta) || 0) * (Number(v.cantidad) || 1))}</span>
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
      <div className="flex items-center justify-between mb-3">
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
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#F6E4E4", color: "#B25C6B" }}>{icon}</div>
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

function ProductosTab({ products, loading, onNew, onEdit, onDelete, onToggleAvailable }) {
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
      const disponible = p.disponible !== false;
      if (f.estado === "disponible" && !disponible) return false;
      if (f.estado === "vendida" && disponible) return false;
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
      return terms.every((t) => hay.includes(t));
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
      <button onClick={onNew} className="w-full rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-medium mb-3" style={{ background: "#B25C6B", color: "#fff" }}>
        <Plus size={16} /> Agregar producto
      </button>

      {/* Búsqueda inteligente + filtros */}
      <div className="relative mb-2">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" color="#B7ACA0" />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="playera + azul + talla M"
          className="w-full rounded-full border pl-10 pr-4 py-2.5 text-sm outline-none"
          style={{ borderColor: "#E4DDD1", background: "#fff" }} />
      </div>

      <div className="flex items-center justify-between gap-2 mb-3">
        <button onClick={() => setAbierto((v) => !v)}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full"
          style={abierto || activos ? { background: "#2B2320", color: "#F7F3EC" } : { background: "#fff", color: "#6B5B52", border: "1px solid #E4DDD1" }}>
          <Filter size={13} /> Filtros{activos > 0 ? ` (${activos})` : ""}
        </button>
        <span className="text-xs" style={{ color: "#9A8F80" }}>{lista.length} de {products.length}</span>
      </div>

      {abierto && (
        <div className="rounded-2xl border p-4 mb-3 space-y-3" style={{ borderColor: "#E9E1D4", background: "#fff" }}>
          <div>
            <label className="text-[10px] uppercase tracking-wide" style={{ color: "#9A8F80" }}>Estado</label>
            <div className="flex gap-1.5 mt-1">
              {[["todos", "Todos"], ["disponible", "Disponible"], ["vendida", "Vendida"]].map(([v, txt]) => (
                <button key={v} onClick={() => setF((prev) => ({ ...prev, estado: v }))}
                  className="text-[11px] px-3 py-1.5 rounded-full flex-1"
                  style={f.estado === v ? { background: "#2B2320", color: "#F7F3EC" } : { background: "#F7F3EC", color: "#6B5B52" }}>{txt}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectFiltro label="Categoría" value={f.categoria} onChange={set("categoria")} options={opciones.categorias} />
            <SelectFiltro label="Color" value={f.color} onChange={set("color")} options={opciones.colores} />
            <SelectFiltro label="Temporada / grupo" value={f.grupo} onChange={set("grupo")} options={opciones.grupos} />
            <SelectFiltro label="Proveedor" value={f.proveedor} onChange={set("proveedor")} options={opciones.proveedores} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wide" style={{ color: "#9A8F80" }}>Compra desde</label>
              <input type="date" value={f.compraDesde} onChange={set("compraDesde")} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide" style={{ color: "#9A8F80" }}>Compra hasta</label>
              <input type="date" value={f.compraHasta} onChange={set("compraHasta")} className={inputCls} style={inputStyle} />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide" style={{ color: "#9A8F80" }}>Ordenar por</label>
            <select value={f.orden} onChange={set("orden")} className={inputCls} style={inputStyle}>
              <option value="reciente">Más reciente</option>
              <option value="antiguos">Más días en inventario</option>
              <option value="precioAlto">Precio: mayor a menor</option>
              <option value="precioBajo">Precio: menor a mayor</option>
              <option value="nombre">Nombre (A-Z)</option>
            </select>
          </div>

          <button onClick={() => { setF(FILTROS_VACIOS); setQ(""); }}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-medium"
            style={{ background: "#F7F3EC", color: "#6B5B52" }}>
            <RotateCcw size={12} /> Limpiar filtros
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm" style={{ color: "#B7ACA0" }}>Cargando…</div>
      ) : products.length === 0 ? (
        <EmptyState text="Aún no hay productos. Agrega el primero." />
      ) : lista.length === 0 ? (
        <EmptyState text="Ningún producto coincide con los filtros." />
      ) : (
        <div className="space-y-2">
          {lista.map((p) => {
            const disponible = p.disponible !== false;
            const dias = diasEnInventario(p);
            return (
              <div key={p.id} className="rounded-xl border p-2.5" style={{ borderColor: "#E9E1D4", background: "#fff", opacity: disponible ? 1 : 0.72 }}>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: "#EFE7DB" }}>
                    {p.imagen ? <img src={p.imagen} className="w-full h-full object-cover" /> : <ImageOff size={16} color="#C6BBAC" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.nombre}</p>
                    <p className="text-xs" style={{ color: "#9A8F80" }}>{p.categoria} · {money(p.precioVenta)} · {p.cantidad || 1} pza</p>
                  </div>
                  <button
                    onClick={() => onToggleAvailable(p.id)}
                    className="flex-shrink-0 text-[10px] font-medium px-2.5 py-1.5 rounded-full tracking-wide uppercase"
                    style={disponible ? { background: "#E4F3E6", color: "#2F8542" } : { background: "#F1EBE0", color: "#8A7F71" }}
                    title={disponible ? "Tocar para marcar como vendida" : "Tocar para regresar a disponible (pide contraseña)"}
                  >
                    {disponible ? "Disponible" : "Vendida"}
                  </button>
                  <button onClick={() => onEdit(p)} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#EFE2DE" }}><Pencil size={13} color="#6B5B52" /></button>
                  <button onClick={() => { if (confirm(`¿Eliminar "${p.nombre}"?`)) onDelete(p.id); }} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#FBEAEA" }}><Trash2 size={13} color="#B23B3B" /></button>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pt-2 border-t text-[11px]" style={{ borderColor: "#F1EBE0", color: "#9A8F80" }}>
                  {dias !== null && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      <strong style={{ color: dias > 90 ? "#B23B3B" : "#6B5B52" }}>{dias}</strong> días en inventario
                    </span>
                  )}
                  {p.fechaCompra && <span className="flex items-center gap-1"><Calendar size={11} /> {fmtDate(dateStrToTs(p.fechaCompra))}</span>}
                  {p.proveedor && <span className="flex items-center gap-1"><Truck size={11} /> {p.proveedor}</span>}
                  {!disponible && p.vendidaAt && (
                    <span className="flex items-center gap-1" style={{ color: "#B25C6B" }}>
                      <Check size={11} /> Vendida el {fmtDateTime(p.vendidaAt)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SelectFiltro({ label, value, onChange, options }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide" style={{ color: "#9A8F80" }}>{label}</label>
      <select value={value} onChange={onChange} className={inputCls} style={inputStyle}>
        <option value="">Todas</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm transition"
      style={active ? { background: "#2B2320", color: "#F7F3EC" } : { background: "#fff", color: "#6B5B52", border: "1px solid #E4DDD1" }}>
      {icon} {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Modal genérico
// ---------------------------------------------------------------------------
function Modal({ children, onClose, title, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0" style={{ background: "rgba(43,35,32,0.4)" }} onClick={onClose} />
      <div className={`relative w-full ${wide ? "md:max-w-xl" : "md:max-w-md"} max-h-[88vh] overflow-y-auto rounded-t-3xl md:rounded-3xl p-6`} style={{ background: "#F7F3EC" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#EFE2DE" }}><X size={15} color="#6B5B52" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulario de producto
// ---------------------------------------------------------------------------
function Field({ label, children }) {
  return <label className="block"><span className="text-xs" style={{ color: "#6B5B52" }}>{label}</span>{children}</label>;
}
const inputCls = "w-full mt-1 rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2";
const inputStyle = { borderColor: "#E4DDD1", background: "#fff" };

function ProductForm({ form, setForm, formImage, onFile, onSubmit, onCancel, saving, fileInputRef }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Nombre / descripción *">
        <input required value={form.nombre} onChange={set("nombre")} className={inputCls} style={inputStyle} placeholder="Playera oversize estampada" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría *">
          <select required value={form.categoria} onChange={set("categoria")} className={inputCls} style={inputStyle}>
            <option value="">Selecciona</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Subcategoría"><input value={form.subcategoria} onChange={set("subcategoria")} className={inputCls} style={inputStyle} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Precio de venta *"><input required type="number" min="0" step="1" value={form.precioVenta} onChange={set("precioVenta")} className={inputCls} style={inputStyle} placeholder="0" /></Field>
        <Field label="Precio de compra (costo)"><input type="number" min="0" step="1" value={form.precioCompra} onChange={set("precioCompra")} className={inputCls} style={inputStyle} placeholder="0" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Talla"><input value={form.talla} onChange={set("talla")} className={inputCls} style={inputStyle} placeholder="M" /></Field>
        <Field label="Color"><input value={form.color} onChange={set("color")} className={inputCls} style={inputStyle} placeholder="verde menta" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Material"><input value={form.material} onChange={set("material")} className={inputCls} style={inputStyle} /></Field>
        <Field label="Género"><input value={form.genero} onChange={set("genero")} className={inputCls} style={inputStyle} placeholder="Mujer / Hombre / Unisex" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Grupo"><input value={form.grupo} onChange={set("grupo")} className={inputCls} style={inputStyle} placeholder="Temporada / colección" /></Field>
        <Field label="Cantidad en stock"><input type="number" min="0" step="1" value={form.cantidad} onChange={set("cantidad")} className={inputCls} style={inputStyle} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha de compra"><input type="date" value={form.fechaCompra || ""} onChange={set("fechaCompra")} className={inputCls} style={inputStyle} /></Field>
        <Field label="Proveedor"><input value={form.proveedor || ""} onChange={set("proveedor")} className={inputCls} style={inputStyle} placeholder="Nombre del proveedor" /></Field>
      </div>
      {form.fechaCompra && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs" style={{ background: "#EFE7DB", color: "#6B5B52" }}>
          <Clock size={13} />
          Lleva <strong className="mx-1">{diasEnInventario({ ...form, createdAt: form.createdAt || Date.now() })}</strong> días en inventario
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ubicación"><input value={form.ubicacion} onChange={set("ubicacion")} className={inputCls} style={inputStyle} placeholder="Estante B2" /></Field>
        <Field label="Estado">
          <select value={form.disponible === false ? "vendida" : "disponible"} onChange={(e) => setForm((f) => ({ ...f, disponible: e.target.value !== "vendida" }))} className={inputCls} style={inputStyle}>
            <option value="disponible">Disponible</option>
            <option value="vendida">Vendida</option>
          </select>
        </Field>
      </div>
      <Field label="Foto"><input ref={fileInputRef} type="file" accept="image/*" onChange={onFile} className={`${inputCls} py-2`} style={inputStyle} /></Field>
      {formImage && <div className="rounded-xl overflow-hidden" style={{ background: "#EFE7DB" }}><img src={formImage} className="w-full max-h-64 object-contain" /></div>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl py-3 text-sm font-medium border" style={{ borderColor: "#E4DDD1", color: "#6B5B52" }}>Cancelar</button>
        <button type="submit" disabled={saving} className="flex-1 rounded-xl py-3 text-sm font-medium disabled:opacity-60" style={{ background: "#2B2320", color: "#F7F3EC" }}>{saving ? "Guardando…" : "Guardar producto"}</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Configuración de la tienda
// ---------------------------------------------------------------------------
function SettingsForm({ settings, onSave, products, onExportBackup, onImportBackup }) {
  const [local, setLocal] = useState(settings);
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
    try { await onImportBackup(file); setImportMsg("¡Restaurado con éxito!"); }
    catch { setImportMsg("No se pudo leer el archivo. Verifica que sea un respaldo válido."); }
    finally { setImporting(false); if (restoreInputRef.current) restoreInputRef.current.value = ""; }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => { e.preventDefault(); onSave(local); }} className="space-y-4">
        <Field label="Nombre de la tienda"><input value={local.nombre} onChange={set("nombre")} className={inputCls} style={inputStyle} /></Field>
        <Field label="Frase / tagline"><input value={local.tagline} onChange={set("tagline")} className={inputCls} style={inputStyle} /></Field>
        <Field label="WhatsApp (con lada, solo números)"><input value={local.whatsapp} onChange={set("whatsapp")} className={inputCls} style={inputStyle} placeholder="5215512345678" /></Field>
        <Field label="PIN de administradora"><input value={local.pin} onChange={set("pin")} className={inputCls} style={inputStyle} /></Field>
        <button type="submit" className="w-full rounded-xl py-3 text-sm font-medium" style={{ background: "#2B2320", color: "#F7F3EC" }}>Guardar configuración</button>
      </form>

      <div className="pt-2 border-t" style={{ borderColor: "#E9E1D4" }}>
        <h3 className="font-display text-lg mb-1 pt-4">Compartir con tus clientes</h3>
        <p className="text-xs mb-3" style={{ color: "#9A8F80" }}>Este es el link real de tu sitio (una vez desplegado). Pégalo aquí si es diferente y genera tu QR.</p>
        <div className="flex gap-2 mb-3">
          <input value={shareUrl} onChange={(e) => setShareUrl(e.target.value)} className={inputCls + " mt-0"} style={inputStyle} placeholder="https://boutique-martita.vercel.app" />
          <button type="button" onClick={copyLink} className="px-4 rounded-xl text-xs flex-shrink-0" style={{ background: "#EFE2DE", color: "#6B5B52" }}>{copied ? "¡Copiado!" : "Copiar"}</button>
        </div>
        {shareUrl && (
          <div className="flex flex-col items-center gap-2 py-3 rounded-xl" style={{ background: "#fff", border: "1px solid #E9E1D4" }}>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(shareUrl)}`} alt="Código QR del catálogo" width={180} height={180} />
            <p className="text-[11px]" style={{ color: "#9A8F80" }}>Escanéalo para probar el link</p>
          </div>
        )}
      </div>

      <div className="pt-2 border-t" style={{ borderColor: "#E9E1D4" }}>
        <h3 className="font-display text-lg mb-1 pt-4">Respaldo de datos</h3>
        <p className="text-xs mb-3" style={{ color: "#9A8F80" }}>Descarga un archivo con todos tus productos y fotos, además de vivir en Firebase.</p>
        <button type="button" onClick={onExportBackup} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium mb-2" style={{ background: "#EFE2DE", color: "#6B5B52" }}>
          <Download size={14} /> Descargar respaldo completo ({products.length} artículos)
        </button>
        <label className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium cursor-pointer" style={{ border: "1px solid #E4DDD1", color: "#6B5B52" }}>
          {importing ? "Restaurando…" : "Restaurar desde respaldo"}
          <input ref={restoreInputRef} type="file" accept="application/json" onChange={handleRestoreFile} className="hidden" disabled={importing} />
        </label>
        {importMsg && <p className="text-xs mt-2 text-center" style={{ color: importMsg.startsWith("¡") ? "#4CAF50" : "#B23B3B" }}>{importMsg}</p>}
      </div>
    </div>
  );
}
