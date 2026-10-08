# DeCA Gestión – demo de viabilidad

Demo rápida (sin login, sin multiempresa, datos en `data.json`). No es la versión de producción ni está validada normativamente.

    npm install
    PUBLIC_DECA_URL=http://localhost:3000 npm start   # http://localhost:3000

## Qué demuestra
- Alta de DeCA con los datos del art. 6 de la Orden FOM/2861/2012 y varios envíos (agrupación).
- PDF nativo (texto seleccionable) con QR dentro y metadatos CreationDate/ModDate.
- GET /d/:token devuelve el PDF directamente (sin login ni botones): es la URL del QR.
- GET /d/:token/qr.png: QR como fichero independiente.
- Modificación método A (mismo PDF y URL; datos antiguos tachados "ya no válidos") y método B (PDF nuevo, nueva URL/QR, original conservado y marcado SUSTITUIDO).
- Sin cierre de descarga a los 7 días.

## Pendiente para producción
Postgres + Prisma, multiempresa, JWT/roles, auditoría, HTTPS (TLS 1.2+) real, entrega al conductor, retención de 1 año, rate limiting holgado, tests y verificación jurídica (Ley 9/2025, Orden TRM/282/2026, RGPD).
