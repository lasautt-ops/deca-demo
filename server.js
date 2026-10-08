const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { buildPdf } = require('./pdf');

const PORT = process.env.PORT || 3000;
const BASE = (process.env.PUBLIC_DECA_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DB = path.join(__dirname, 'data.json');
let decas = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : [];
const save = () => fs.writeFileSync(DB, JSON.stringify(decas, null, 2));
const publicUrl = (d) => `${BASE}/d/${d.token}`;

const NIF_RE = /^[A-Z0-9][0-9]{7}[A-Z0-9]$/i;
const MAT_RE = /^[0-9]{4}\s?[A-Z]{3}$|^[A-Z]{1,2}\s?[0-9]{4}\s?[A-Z]{1,2}$/i;
const str = (v) => String(v ?? '').trim();

function validate(b) {
  const e = [];
  if (!['CARGADOR_CONTRACTUAL', 'TRANSPORTISTA_EFECTIVO'].includes(b.rolEmpresa)) e.push('rolEmpresa inválido');
  for (const [k, l] of [['cargador', 'Cargador'], ['transportista', 'Transportista']]) {
    const o = b[k] || {};
    if (!str(o.nombre)) e.push(`${l}: nombre obligatorio`);
    if (!NIF_RE.test(str(o.nif))) e.push(`${l}: NIF no válido`);
  }
  if (!str(b.cargador?.domicilio)) e.push('Cargador: domicilio obligatorio');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(b.fechaTransporte))) e.push('Fecha de transporte inválida');
  if (!MAT_RE.test(str(b.matricula))) e.push('Matrícula no válida');
  if (!Array.isArray(b.envios) || !b.envios.length) e.push('Al menos un envío');
  else b.envios.forEach((x, i) => {
    if (!str(x.origen) || !str(x.destino) || !str(x.naturaleza)) e.push(`Envío ${i + 1}: origen, destino y naturaleza obligatorios`);
    if (!(Number(x.pesoKg) > 0)) e.push(`Envío ${i + 1}: peso debe ser > 0`);
  });
  return e;
}
const clean = (b) => ({
  rolEmpresa: b.rolEmpresa,
  cargador: { nombre: str(b.cargador.nombre), nif: str(b.cargador.nif).toUpperCase(), domicilio: str(b.cargador.domicilio) },
  transportista: { nombre: str(b.transportista.nombre), nif: str(b.transportista.nif).toUpperCase() },
  fechaTransporte: str(b.fechaTransporte), matricula: str(b.matricula).toUpperCase(), remolque: str(b.remolque).toUpperCase(),
  autorizacionEspecial: str(b.autorizacionEspecial), observaciones: str(b.observaciones),
  envios: b.envios.map((x) => ({ origen: str(x.origen), destino: str(x.destino), naturaleza: str(x.naturaleza), pesoKg: Number(x.pesoKg) }))
});
function newDeca(data, extra = {}) {
  const now = new Date().toISOString();
  const d = {
    id: crypto.randomUUID(), token: crypto.randomBytes(32).toString('base64url'),
    numero: `DECA-${new Date().getFullYear()}-${String(decas.length + 1).padStart(4, '0')}`,
    ...data, estado: 'VIGENTE', createdAt: now, modifiedAt: now, versiones: [], ...extra
  };
  decas.push(d); return d;
}
const view = (d) => ({ ...d, url: publicUrl(d) });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/health', (_q, r) => r.json({ ok: true, application: 'deca-demo' }));

app.get('/api/deca', (_q, r) => r.json(decas.slice().reverse().map(view)));
app.get('/api/deca/:id', (q, r) => { const d = decas.find((x) => x.id === q.params.id); d ? r.json(view(d)) : r.status(404).json({ ok: false, error: 'No encontrado' }); });
app.post('/api/deca', (q, r) => {
  const errs = validate(q.body);
  if (errs.length) return r.status(400).json({ ok: false, error: errs.join('; ') });
  const d = newDeca(clean(q.body)); save(); r.status(201).json(view(d));
});

// Modificación: método A (mismo PDF, misma URL) o B (PDF nuevo, nueva URL)
app.post('/api/deca/:id/modificar', (q, r) => {
  const d = decas.find((x) => x.id === q.params.id);
  if (!d) return r.status(404).json({ ok: false, error: 'No encontrado' });
  if (d.estado === 'SUSTITUIDO') return r.status(409).json({ ok: false, error: 'DeCA ya sustituido; modifica el vigente' });
  const { metodo, motivo, cambios } = q.body;
  if (!['MISMO_PDF', 'NUEVO_PDF'].includes(metodo)) return r.status(400).json({ ok: false, error: 'metodo inválido' });
  if (!str(motivo)) return r.status(400).json({ ok: false, error: 'El motivo es obligatorio' });
  const merged = clean({ ...d, ...cambios, cargador: { ...d.cargador, ...(cambios?.cargador || {}) }, transportista: { ...d.transportista, ...(cambios?.transportista || {}) }, envios: cambios?.envios || d.envios });
  const errs = validate(merged);
  if (errs.length) return r.status(400).json({ ok: false, error: errs.join('; ') });

  if (metodo === 'MISMO_PDF') {
    const prev = {};
    for (const k of ['matricula', 'remolque', 'fechaTransporte', 'autorizacionEspecial', 'observaciones']) if (str(d[k]) !== str(merged[k])) prev[k] = d[k] || '(vacío)';
    if (JSON.stringify(d.envios) !== JSON.stringify(merged.envios)) prev.envios = d.envios.map((e) => `${e.origen}→${e.destino} ${e.naturaleza} ${e.pesoKg}kg`).join(' | ');
    if (!Object.keys(prev).length) return r.status(400).json({ ok: false, error: 'No hay cambios' });
    Object.assign(d, merged);
    d.versiones.push({ fecha: new Date().toISOString(), motivo: str(motivo), datosAnteriores: prev });
    d.modifiedAt = new Date().toISOString();
    save(); return r.json(view(d));
  }
  const nuevo = newDeca(merged, { sustituyeA: { id: d.id, numero: d.numero } });
  d.estado = 'SUSTITUIDO'; d.sustituidoPor = { id: nuevo.id, numero: nuevo.numero, motivo: str(motivo) }; d.modifiedAt = new Date().toISOString();
  save(); r.status(201).json(view(nuevo));
});

// RUTAS PÚBLICAS (sin login). /d/:token devuelve el PDF directamente: es la URL del QR.
const byToken = (q) => decas.find((x) => x.token === q.params.token);
app.get('/d/:token', async (q, r) => {
  const d = byToken(q); if (!d) return r.status(404).type('text').send('Documento no encontrado');
  const pdf = await buildPdf(d, publicUrl(d));
  r.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${d.numero}.pdf"`, 'Cache-Control': 'no-store' }).send(pdf);
});
app.get('/d/:token/qr.png', async (q, r) => {
  const d = byToken(q); if (!d) return r.status(404).end();
  r.type('png').send(await QRCode.toBuffer(publicUrl(d), { errorCorrectionLevel: 'M', width: 600, margin: 2 }));
});
app.listen(PORT, () => console.log(`DeCA demo en ${BASE}`));
