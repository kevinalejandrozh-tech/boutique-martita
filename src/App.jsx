import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, Plus, X, Trash2, Pencil, Download, Lock, Unlock,
  ShoppingBag, LayoutDashboard, Settings, ImageOff,
  Package, DollarSign, TrendingUp, Send, Check,
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
  material: "", genero: "", precioVenta: "", precioCompra: "", cantidad: 1,
  ubicacion: "", imagen: null,
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
      Color: p.color, Talla: p.talla, Material: p.material, Género: p.genero,
      Cantidad: p.cantidad, "Precio compra": p.precioCompra, "Precio venta": p.precioVenta,
      "Valor inventario (costo)": (Number(p.precioCompra) || 0) * (Number(p.cantidad) || 1),
      "Valor inventario (venta)": (Number(p.precioVenta) || 0) * (Number(p.cantidad) || 1),
      Ubicación: p.ubicacion,
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
              <span className="font-display text-xl" style={{ color: "#B25C6B" }}>M</span>
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
          products={products} stats={stats}
          onNew={openNewForm} onEdit={openEditForm} onDelete={deleteProduct}
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
  return (
    <div className="rounded-2xl overflow-hidden border flex flex-col" style={{ borderColor: "#E9E1D4", background: "#fff" }}>
      <div className="aspect-[3/4] flex items-center justify-center" style={{ background: "#EFE7DB" }}>
        {p.imagen ? <img src={p.imagen} alt={p.nombre} className="w-full h-full object-cover" /> : <ImageOff size={22} color="#C6BBAC" />}
      </div>
      <div className="p-3 flex flex-col flex-1">
        <p className="text-[10px] tracking-widest uppercase" style={{ color: "#B25C6B" }}>{p.categoria}</p>
        <p className="text-sm font-medium leading-snug mt-0.5 line-clamp-2">{p.nombre}</p>
        {(p.talla || p.color) && <p className="text-[11px] mt-0.5" style={{ color: "#9A8F80" }}>{[p.talla, p.color].filter(Boolean).join(" · ")}</p>}
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="font-display text-lg">{money(p.precioVenta)}</span>
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
function AdminView({ products, stats, onNew, onEdit, onDelete, onExport, loading }) {
  const [tab, setTab] = useState("dashboard");
  return (
    <main className="max-w-5xl mx-auto px-4 pb-16">
      <div className="flex gap-2 pt-6">
        <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={<LayoutDashboard size={14} />} label="Dashboard" />
        <TabButton active={tab === "productos"} onClick={() => setTab("productos")} icon={<Package size={14} />} label="Productos" />
      </div>

      {tab === "dashboard" ? (
        <div className="pt-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard icon={<Package size={16} />} label="Total artículos" value={stats.totalArticulos} />
            <StatCard icon={<DollarSign size={16} />} label="Valor (costo)" value={money(stats.valorCosto)} />
            <StatCard icon={<TrendingUp size={16} />} label="Valor (venta)" value={money(stats.valorVenta)} accent />
          </div>
          <div className="rounded-2xl border p-4" style={{ borderColor: "#E9E1D4", background: "#fff" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg">Por categoría</h3>
              <button onClick={onExport} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full" style={{ background: "#EFE2DE", color: "#6B5B52" }}>
                <Download size={13} /> Exportar Excel
              </button>
            </div>
            {Object.keys(stats.porCategoria).length === 0 ? (
              <p className="text-sm" style={{ color: "#9A8F80" }}>Agrega productos para ver estadísticas.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats.porCategoria).sort((a, b) => b[1].valor - a[1].valor).map(([cat, d]) => (
                  <div key={cat} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0" style={{ borderColor: "#F1EBE0" }}>
                    <span>{cat}</span><span style={{ color: "#9A8F80" }}>{d.count} pza · {money(d.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="pt-6">
          <button onClick={onNew} className="w-full rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-medium mb-4" style={{ background: "#B25C6B", color: "#fff" }}>
            <Plus size={16} /> Agregar producto
          </button>
          {loading ? (
            <div className="py-16 text-center text-sm" style={{ color: "#B7ACA0" }}>Cargando…</div>
          ) : products.length === 0 ? (
            <EmptyState text="Aún no hay productos. Agrega el primero." />
          ) : (
            <div className="space-y-2">
              {products.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border p-2.5" style={{ borderColor: "#E9E1D4", background: "#fff" }}>
                  <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: "#EFE7DB" }}>
                    {p.imagen ? <img src={p.imagen} className="w-full h-full object-cover" /> : <ImageOff size={16} color="#C6BBAC" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.nombre}</p>
                    <p className="text-xs" style={{ color: "#9A8F80" }}>{p.categoria} · {money(p.precioVenta)} · {p.cantidad || 1} pza</p>
                  </div>
                  <button onClick={() => onEdit(p)} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#EFE2DE" }}><Pencil size={13} color="#6B5B52" /></button>
                  <button onClick={() => { if (confirm(`¿Eliminar "${p.nombre}"?`)) onDelete(p.id); }} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#FBEAEA" }}><Trash2 size={13} color="#B23B3B" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
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

function StatCard({ icon, label, value, accent }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "#E9E1D4", background: accent ? "#2B2320" : "#fff" }}>
      <div className="flex items-center gap-1.5 text-xs mb-2" style={{ color: accent ? "#D9CFC4" : "#9A8F80" }}>{icon} {label}</div>
      <p className="font-display text-2xl" style={{ color: accent ? "#F7F3EC" : "#2B2320" }}>{value}</p>
    </div>
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
        <Field label="Cantidad en stock"><input type="number" min="0" step="1" value={form.cantidad} onChange={set("cantidad")} className={inputCls} style={inputStyle} /></Field>
        <Field label="Ubicación en almacén"><input value={form.ubicacion} onChange={set("ubicacion")} className={inputCls} style={inputStyle} placeholder="Estante B2" /></Field>
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
