# Boutique Martita — Catálogo web

Catálogo de ropa con panel de administradora, carrito con pedido por WhatsApp,
Dashboard de inventario y exportación a Excel. Los datos (productos y fotos)
viven en Firebase Firestore, en tiempo real entre todos los dispositivos.

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
