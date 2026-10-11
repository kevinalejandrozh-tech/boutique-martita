import React from "react";
import { X } from "lucide-react";

// ---------------------------------------------------------------------------
// Piezas de interfaz compartidas
// ---------------------------------------------------------------------------
export const inputCls = "w-full mt-1 rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2";
export const inputStyle = { borderColor: "#E4DDD1", background: "#fff" };

export function Field({ label, children }) {
  return <label className="block"><span className="text-xs" style={{ color: "#6B5B52" }}>{label}</span>{children}</label>;
}

// Modal genérico (hoja inferior en celular, ventana centrada en computadora).
// `capa` permite apilar ventanas: 50 normal, 60 editor de textos, 70 editor de imagen.
export function Modal({ children, onClose, title, wide, muyAncho, capa = 50 }) {
  const ancho = muyAncho ? "md:max-w-3xl" : wide ? "md:max-w-xl" : "md:max-w-md";
  return (
    <div className="fixed inset-0 flex items-end md:items-center justify-center" style={{ zIndex: capa }}>
      <div className="absolute inset-0" style={{ background: "rgba(43,35,32,0.4)" }} onClick={onClose} />
      <div className={`relative w-full ${ancho} max-h-[88vh] overflow-y-auto rounded-t-3xl md:rounded-3xl p-6`} style={{ background: "#F7F3EC" }}>
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="font-display text-2xl min-w-0">{title}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#EFE2DE" }} aria-label="Cerrar"><X size={15} color="#6B5B52" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
