# Boutique Martita — Catálogo web

Catálogo de ropa con panel de administradora, carrito con pedido por WhatsApp,
Dashboard de inventario y exportación a Excel. Los datos (productos y fotos)
viven en Firebase Firestore, en tiempo real entre todos los dispositivos.

## Modo edición

Entra como administradora y toca **Editar sitio** (o «Entrar y editar el sitio» al
escribir el PIN). En modo edición se puede tocar cualquier texto o imagen para
cambiarlo; «Todos los textos» lista también los que no se ven (ejemplos de búsqueda,
mensaje de WhatsApp, avisos). «Diseño e imágenes» cambia el formato de las fotos,
el tamaño de las tarjetas, el logo, la portada y los **colores** (fondo, encabezado,
pie de página, botones y acento). Los colores se guardan en `settings/store`
(`colorFondo`, `colorEncabezado`, `colorPie`, `colorBoton`, `colorAcento`, …).

## Datos en Firestore

| Documento | Contenido |
|---|---|
| `products/{id}` | Producto. `cantidad` = piezas en stock, `ventas` = historial de ventas por pieza, `oculto`, `imagen` (recorte) y `recorte` |
| `settings/store` | Nombre, frase, WhatsApp, PIN y ajustes de diseño (`fotoAspecto`, `tarjetaTam`, `logoTam`) |
| `settings/categorias` | `lista` ordenada de categorías |
| `settings/textos` | Textos modificados (los no modificados usan `src/textos.js`) |
| `settings/img_logo`, `settings/img_portada` | Logo y portada |
| `settings/foto_original_{id}` | Foto original sin recortar (solo se carga al editar) |

Los catálogos preparados viven en `public/importar/` (listados en `index.json`) y se
cargan desde Configuración → «Catálogos listos para cargar».

## Correr localmente

```bash
npm install
npm run dev
```

## Desplegar en Vercel (recomendado, gratis)

1. Sube esta carpeta a un repositorio de GitHub.
2. Entra a vercel.com → "Add New Project" → importa el repositorio.
3. Vercel detecta Vite automáticamente. Dale "Deploy".
4. Listo — obtienes un link tipo `https://boutique-martita.vercel.app`.

## Reglas de seguridad de Firestore

Antes de compartir el link públicamente, ve a la consola de Firebase →
Firestore Database → Reglas, y pega esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /products/{productId} {
      allow read: if true;
      allow write: if true;
    }
    match /settings/{doc} {
      allow read: if true;
      allow write: if true;
    }
  }
}
```

**Nota de seguridad:** estas reglas son abiertas (cualquiera con el link podría
en teoría escribir directo a la base de datos vía herramientas de desarrollador,
saltándose el PIN de la app). Para una boutique pequeña el riesgo es bajo, pero
si el negocio crece vale la pena migrar a reglas con autenticación real.
