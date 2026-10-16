// Dictamen firmado en PDF para imprimir como documento legal (RF-26, CU-08). Se genera en cada
// descarga, sin guardar copias (arquitectura §7.4).
import PDFDocument from 'pdfkit';
import type { Especie, Fotografia, TrabajoAereo, TrabajoSubterraneo, Dictamen } from '@prisma/client';
import { fotos } from '../integraciones';

type DictamenPdf = Dictamen & {
  especie: Especie;
  trabajosAereos: TrabajoAereo[];
  trabajosSubterraneos: TrabajoSubterraneo[];
  fotografias: Fotografia[];
};

const si = (b: boolean) => (b ? 'Sí' : 'No');
const o = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

/** `comprimir: false` deja el texto legible dentro del archivo (lo usan las pruebas). */
export async function generarPdf(d: DictamenPdf, { comprimir = true } = {}): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, compress: comprimir, info: { Title: `Dictamen ${d.numeroSua}-${d.anio}` } });
  const partes: Buffer[] = [];
  doc.on('data', (p: Buffer) => partes.push(p));
  const fin = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(partes))));

  const verde = '#0F6E56';
  doc.fillColor(verde).fontSize(9).text('MUNICIPALIDAD DE ROSARIO · Secretaría de Ambiente y Espacio Público');
  doc.text('Dirección General de Parques y Paseos · Dirección Técnica de Arbolado');
  doc.moveDown(0.6).fillColor('#000').fontSize(18).text('Dictamen Técnico de Arbolado');
  doc.fontSize(10).fillColor('#444').text(`Solicitud SUA ${d.numeroSua}-${d.anio} · Dictamen N.° ${d.idDictamen}`);
  doc.moveDown();

  const seccion = (titulo: string) => {
    doc.moveDown(0.6).fillColor(verde).fontSize(11).text(titulo.toUpperCase());
    doc.moveTo(48, doc.y + 2).lineTo(547, doc.y + 2).strokeColor('#cfe3dc').stroke();
    doc.moveDown(0.4).fillColor('#000').fontSize(10);
  };
  const fila = (etiqueta: string, valor: unknown) => {
    doc.font('Helvetica-Bold').text(`${etiqueta}: `, { continued: true }).font('Helvetica').text(o(valor));
  };

  seccion('1 · Datos del ejemplar y ubicación');
  fila('Nota N.°', d.notaNumero);
  fila('Expediente N.°', d.expedienteNumero);
  fila('Domicilio del ejemplar', d.domicilioEjemplar);
  fila('Coordenadas', `${d.latitudEjemplar.toFixed(6)}, ${d.longitudEjemplar.toFixed(6)}`);
  fila('Referencia de ubicación', d.referenciaUbicacion);
  fila('Distancia a medianera / referencia (m)', d.distanciaMedianeraReferencia);
  fila('Especie', `${d.especie.nombreComun}${d.especie.nombreCientifico ? ` (${d.especie.nombreCientifico})` : ''}`);
  fila('Cantidad de ejemplares al frente', d.cantidadFrente);

  seccion('2 · Diagnóstico');
  fila('Nivel de daño en vereda', d.nivelDanoVereda);
  fila('Extracción', si(d.esExtraccion));
  if (d.esExtraccion) {
    fila('Perímetro del tronco (m)', d.perimetroTronco);
    fila('Motivo de extracción', d.motivoExtraccion);
  }
  fila('Sin trabajo', si(d.esSinTrabajo));
  if (d.esSinTrabajo) fila('Motivo', d.motivoSinTrabajo);

  seccion('3 · Intervención');
  fila(
    'Trabajos subterráneos',
    d.trabajosSubterraneos.map((t) => (t.distanciaBorde != null ? `${t.tipoTrabajo} (${t.distanciaBorde} m del borde)` : t.tipoTrabajo)).join('; ') || 'Ninguno',
  );
  fila('Trabajos aéreos', d.trabajosAereos.map((t) => t.tipoTrabajo).join('; ') || 'Ninguno');

  seccion('4 · Información adicional');
  fila('Complejidad de la intervención', d.complejidad);
  fila('Urgente', si(d.urgente));
  fila('Árbol frente a garage', si(d.arbolFrenteGarage));
  fila('Media tensión', si(d.mediaTension));
  fila('De oficio', si(d.deOficio));
  fila('Plantar árboles', d.plantar);

  seccion('5 · Prioridad y observaciones');
  fila('Nivel de prioridad de la intervención', d.nivelPrioridad);
  fila('Observaciones', d.observaciones);

  seccion('Firma digital');
  fila('Firmado por', d.nombreUsuario);
  fila('Fecha y hora', d.fechaEmision.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }));
  fila('Hash SHA-256', d.hashFirma);
  fila('Segundo factor', d.segundoFactor === 'Simulado' ? 'Verificación biométrica (simulada en esta demo)' : d.segundoFactor);
  if (d.vigente === false) fila('Estado', 'NO VIGENTE: un Jefe eligió otro dictamen para este caso');

  const imagenes = [...d.fotografias].sort((a, b) => a.orden - b.orden);
  if (imagenes.length) {
    doc.addPage();
    doc.fillColor(verde).fontSize(11).text('FOTOGRAFÍAS DEL EJEMPLAR');
    doc.moveDown(0.5);
    for (const f of imagenes) {
      const archivo = await fotos.obtener(f.archivoReferencia);
      if (!archivo || !/jpeg|png/.test(archivo.tipoMime)) continue;
      if (doc.y > 560) doc.addPage();
      doc.image(archivo.datos, { fit: [499, 260], align: 'center' });
      doc.moveDown(0.3).fillColor('#444').fontSize(9).text(`Fotografía ${f.orden}`);
      doc.moveDown(0.6);
    }
  }
  doc.end();
  return fin;
}
