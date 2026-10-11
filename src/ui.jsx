import React from "react";
import { X } from "lucide-react";

// ---------------------------------------------------------------------------
// Piezas de interfaz compartidas
// ---------------------------------------------------------------------------
export const inputCls = "w-full mt-1 rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2";
export const inputStyle = { borderColor: "#E3E0EC", background: "#fff" };

export function Field({ label, children }) {
  return <label className="block"><span className="text-xs" style={{ color: "#4A4760" }}>{label}</span>{children}</label>;
}

// Modal genérico (hoja inferior en celular, ventana centrada en computadora).
// `capa` permite apilar ventanas: 50 normal, 60 editor de textos, 70 editor de imagen.
export function Modal({ children, onClose, title, wide, muyAncho, capa = 50 }) {
  const ancho = muyAncho ? "md:max-w-3xl" : wide ? "md:max-w-xl" : "md:max-w-md";
  return (
    <div className="fixed inset-0 flex items-end md:items-center justify-center" style={{ zIndex: capa }}>
      <div className="absolute inset-0" style={{ background: "rgba(23,21,43,0.4)" }} onClick={onClose} />
      <div className={`relative w-full ${ancho} max-h-[88vh] overflow-y-auto rounded-t-3xl md:rounded-3xl p-6`} style={{ background: "#F6F5FA" }}>
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="font-display text-2xl min-w-0">{title}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#ECE8F6" }} aria-label="Cerrar"><X size={15} color="#4A4760" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Colores personalizables del sitio (se guardan en settings/store)
export const COLORES = [
  ["colorFondo", "Fondo de la página", "#FBFAFD"],
  ["colorEncabezado", "Fondo del encabezado", "#16132E"],
  ["colorEncabezadoTexto", "Texto del encabezado", "#FFFFFF"],
  ["colorPie", "Fondo del pie de página", "#16132E"],
  ["colorPieTexto", "Texto del pie de página", "#CFC8E8"],
  ["colorBoton", "Botones principales", "#16132E"],
  ["colorBotonTexto", "Texto de los botones", "#FFFFFF"],
  ["colorAcento", "Color de acento", "#6B4FA0"],
];
export function varsColores(settings = {}) {
  const ok = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
  const v = {};
  COLORES.forEach(([k, , d]) => { v["--" + k] = ok(settings[k]) ? settings[k] : d; });
  return v;
}
