const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const fmt = (d) => new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
const ROL = { CARGADOR_CONTRACTUAL: 'Cargador contractual', TRANSPORTISTA_EFECTIVO: 'Transportista efectivo' };

async function buildPdf(deca, url) {
  const qr = await QRCode.toBuffer(url, { errorCorrectionLevel: 'M', width: 400, margin: 2 });
  const doc = new PDFDocument({
    size: 'A4', margin: 40,
    info: {
      Title: `DeCA ${deca.numero}`, Author: 'DeCA Gestion (demo)', Subject: 'Documento electronico de control administrativo',
      CreationDate: new Date(deca.createdAt), ModDate: new Date(deca.modifiedAt)
    }
  });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((r) => doc.on('end', () => r(Buffer.concat(chunks))));

  doc.fontSize(15).font('Helvetica-Bold').text('DOCUMENTO ELECTRÓNICO DE CONTROL ADMINISTRATIVO (DeCA)', 40, 40, { width: 390 });
  doc.fontSize(10).font('Helvetica').text(`Nº ${deca.numero}`, 40, 85);
  doc.text(`Creado: ${fmt(deca.createdAt)}`);
  doc.text(`Última modificación: ${fmt(deca.modifiedAt)}  ·  Versión ${deca.versiones.length + 1}`);
  if (deca.estado === 'SUSTITUIDO') doc.fillColor('red').font('Helvetica-Bold').text('DOCUMENTO SUSTITUIDO – NO VÁLIDO. Ver nuevo DeCA vinculado.').fillColor('black').font('Helvetica');
  if (deca.sustituyeA) doc.text(`Sustituye al DeCA ${deca.sustituyeA.numero} (por modificación).`);
  doc.image(qr, 450, 35, { width: 110 });
  doc.fontSize(6).text(url, 420, 148, { width: 150 });

  const sec = (t) => { doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).text(t, 40).moveDown(0.2).font('Helvetica').fontSize(10); };
  doc.y = 165;
  sec('Cargador contractual' + (deca.rolEmpresa === 'CARGADOR_CONTRACTUAL' ? ' (emisor)' : ''));
  doc.text(`${deca.cargador.nombre}  ·  NIF ${deca.cargador.nif}`).text(`Domicilio: ${deca.cargador.domicilio}`);
  sec('Transportista efectivo' + (deca.rolEmpresa === 'TRANSPORTISTA_EFECTIVO' ? ' (emisor)' : ''));
  doc.text(`${deca.transportista.nombre}  ·  NIF ${deca.transportista.nif}`);
  sec('Transporte');
  doc.text(`Fecha de realización: ${deca.fechaTransporte}`);
  doc.text(`Matrícula vehículo: ${deca.matricula}${deca.remolque ? '   ·   Remolque/semirremolque: ' + deca.remolque : ''}`);
  if (deca.autorizacionEspecial) doc.text(`Autorización especial de circulación: ${deca.autorizacionEspecial}`);
  sec(deca.envios.length > 1 ? 'Envíos (el orden no implica orden de ejecución)' : 'Envío');
  deca.envios.forEach((e, i) => {
    doc.font('Helvetica-Bold').text(`Envío ${i + 1}`, { continued: false }).font('Helvetica');
    doc.text(`Origen: ${e.origen}   ->   Destino: ${e.destino}`);
    doc.text(`Mercancía: ${e.naturaleza}   ·   Peso: ${e.pesoKg} kg`).moveDown(0.3);
  });
  if (deca.observaciones) { sec('Observaciones'); doc.text(deca.observaciones); }

  if (deca.versiones.length) {
    sec('Historial de modificaciones');
    deca.versiones.forEach((v) => {
      doc.font('Helvetica-Bold').text(`Modificación ${fmt(v.fecha)} — Motivo: ${v.motivo}`).font('Helvetica');
      doc.fillColor('#a00').text('Datos anteriores (YA NO VÁLIDOS):', { continued: false });
      Object.entries(v.datosAnteriores).forEach(([k, val]) => doc.text(`${k}: ${val}`, { strike: true }));
      doc.fillColor('black').moveDown(0.3);
    });
  }
  doc.fontSize(7).fillColor('#555').text('Documento generado de forma nativa digital a partir de datos estructurados. Versión demo: no sustituye validación normativa.', 40, 790, { width: 515 });
  doc.end();
  return done;
}
module.exports = { buildPdf };
