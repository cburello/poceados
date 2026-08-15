/**
 * Fuente primaria: la app de extractos de Lotería de Santa Fe.
 *
 * OJO con la URL: la página pública (loteriasantafe.gov.ar/index.php/resultados/quini-6)
 * NO tiene los resultados. Es una cáscara con un iframe vacío que JavaScript llena
 * después apuntando a otro servidor, en el puerto 8443. El HTML de verdad está acá.
 *
 * Estructura real (Joomla + PrimeFaces):
 *   <h3>Tradicional Primer Sorteo</h3>
 *   <div class="row">
 *     <div class="col-xs-2 cuadrado"><b>23</b></div>   (x6)
 *   </div>
 *   <div class="cont2"><table> con thead: Premio | POZO $ | Ganadores | Premios $
 *
 * Siempre Sale trae una columna extra "Aciertos". Por eso las columnas se leen
 * por nombre de encabezado y no por posición: un mismo parser sirve para las dos formas.
 */

import * as cheerio from 'cheerio';
import type { Proveedor, SorteoCrudo, ResultadoCrudo, EscalonCrudo } from './tipos.ts';

const EXTRACTOS = 'https://apps.loteriasantafe.gov.ar:8443/Extractos/paginas';
export const URL_QUINI6 = `${EXTRACTOS}/mostrarQuini6.xhtml?display=0`;
export const URL_BRINCO = `${EXTRACTOS}/mostrarBrinco.xhtml?display=0`;

/** Saca acentos y normaliza para comparar títulos sin sorpresas. */
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Del título del h3 al código de modalidad. Por palabra clave, no por texto exacto. */
export function codigoDeTitulo(titulo: string): string | null {
  const t = normalizar(titulo);
  if (t.includes('EXTRA')) return null; // el Premio Extra lo calculamos nosotros
  if (t.includes('PRIMER SORTEO')) return 'TRADICIONAL';
  if (t.includes('SEGUNDA')) return 'SEGUNDA';
  if (t.includes('REVANCHA')) return 'REVANCHA';
  if (t.includes('SIEMPRE SALE')) return 'SIEMPRE_SALE';
  if (t.includes('TRADICIONAL')) return 'TRADICIONAL';
  return null;
}

/** "7.282.064.412,00" -> 7282064412 */
export function aNumero(txt: string): number {
  const limpio = txt.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}

/** "2 Premio" -> 5 aciertos si el juego es de 6 numeros. "Estimulo" -> null. */
function aciertosDeEtiqueta(etiqueta: string, cantidadNumeros: number): number | null {
  const m = etiqueta.match(/(\d+)\s*°/);
  if (!m) return null;
  const orden = Number.parseInt(m[1]!, 10);
  const aciertos = cantidadNumeros - (orden - 1);
  return aciertos > 0 ? aciertos : null;
}

export function parsearExtracto(
  html: string,
  juegoCodigo: string,
  cantidadNumeros = 6,
): SorteoCrudo {
  const $ = cheerio.load(html);
  const resultados: ResultadoCrudo[] = [];

  $('h3').each((_, h3) => {
    const codigo = codigoDeTitulo($(h3).text());
    if (!codigo) return;

    // El bloque de la modalidad: desde el h3 hasta el proximo h3.
    const bloque = $(h3).nextUntil('h3');

    const numeros: number[] = [];
    bloque.find('.cuadrado b').each((__, b) => {
      const n = Number.parseInt($(b).text().trim(), 10);
      if (Number.isInteger(n)) numeros.push(n);
    });
    if (!numeros.length) return;

    // --- tabla de premios, mapeada por nombre de encabezado ---
    const tabla = bloque.find('table').first();
    const columnas: string[] = [];
    tabla.find('thead th').each((__, th) => {
      columnas.push(normalizar($(th).text()));
    });

    const indiceDe = (nombre: string) => columnas.findIndex((c) => c.includes(nombre));
    const celda = (fila: ReturnType<typeof $>, nombre: string): string => {
      const i = indiceDe(nombre);
      return i === -1 ? '' : fila.find('td').eq(i).text().trim();
    };

    const iAciertos = indiceDe('ACIERTO');
    const tieneColAciertos = iAciertos !== -1;

    const escalones: EscalonCrudo[] = [];
    let nivelGanador: number | null | undefined = undefined;

    tabla.find('tbody tr').each((__, tr) => {
      const fila = $(tr);
      const etiqueta = celda(fila, 'PREMIO').replace(/\s+/g, ' ').trim();
      if (!etiqueta) return;

      const textoGanadores = celda(fila, 'GANADOR');
      const vacante = /VACANTE/i.test(textoGanadores);

      // En Siempre Sale la cantidad de aciertos viene en su propia columna.
      // En el resto se deduce del orden del premio.
      let aciertos: number | null;
      if (tieneColAciertos) {
        const v = Number.parseInt(fila.find('td').eq(iAciertos).text().trim(), 10);
        aciertos = Number.isInteger(v) ? v : null;
      } else {
        aciertos = aciertosDeEtiqueta(etiqueta, cantidadNumeros);
      }

      if (tieneColAciertos && /1\s*°/.test(etiqueta) && aciertos !== null) {
        nivelGanador = aciertos;
      }

      escalones.push({
        aciertos,
        etiqueta,
        pozo: aNumero(celda(fila, 'POZO')),
        ganadores: vacante ? 0 : aNumero(textoGanadores),
        premioUnitario: vacante ? 0 : aNumero(celda(fila, 'PREMIOS')),
        vacante,
      });
    });

    resultados.push({ modalidadCodigo: codigo, numeros, nivelGanador, escalones });
  });

  if (!resultados.length) {
    throw new Error(
      'No se reconocio ninguna modalidad. Probablemente cambio el maquetado del extracto.',
    );
  }

  return {
    juegoCodigo,
    nroConcurso: buscarConcurso($),
    fecha: buscarFecha($),
    resultados,
    urlExtracto: buscarUrlExtracto($),
  };
}

const MESES: Record<string, string> = {
  ENERO: '01', FEBRERO: '02', MARZO: '03', ABRIL: '04',
  MAYO: '05', JUNIO: '06', JULIO: '07', AGOSTO: '08',
  SEPTIEMBRE: '09', OCTUBRE: '10', NOVIEMBRE: '11', DICIEMBRE: '12',
};

/**
 * El extracto no trae ninguna fecha completa en ningun lado. Se arma juntando
 * dos selectores de PrimeFaces:
 *   mes    -> <option selected>Agosto 2026</option>
 *   sorteo -> <option>Miercoles 12 - 3399</option>   (dia y numero de concurso)
 * La primera opcion del select de sorteos es la que la pagina esta mostrando.
 */
function leerSelector($: cheerio.CheerioAPI, id: string): { texto: string; opciones: string[] } {
  const sel = $(`select[id="${id}"]`);
  const opciones = sel
    .find('option')
    .map((_, o) => $(o).text().trim())
    .get();
  const marcada = sel.find('option[selected]').first().text().trim();
  return { texto: marcada || opciones[0] || '', opciones };
}

export function buscarConcurso($: cheerio.CheerioAPI): number {
  const { texto } = leerSelector($, 'form:sorteoSeleccionado_input');
  const m = texto.match(/(\d{3,5})\s*$/);
  return m ? Number.parseInt(m[1]!, 10) : 0;
}

export function buscarFecha($: cheerio.CheerioAPI): string {
  const mes = leerSelector($, 'form:mesSeleccionado_input').texto;
  const sorteo = leerSelector($, 'form:sorteoSeleccionado_input').texto;

  const mMes = normalizar(mes).match(/([A-Z]+)\s+(\d{4})/);
  const mDia = sorteo.match(/-?\s*(\d{1,2})\s*-/) ?? sorteo.match(/\s(\d{1,2})\s/);

  if (!mMes || !mDia) return new Date().toISOString().slice(0, 10);

  const numeroMes = MESES[mMes[1]!];
  if (!numeroMes) return new Date().toISOString().slice(0, 10);

  return `${mMes[2]}-${numeroMes}-${mDia[1]!.padStart(2, '0')}`;
}

/** Enlace al PDF oficial. El id del reporte es 400 + el numero de concurso. */
export function buscarUrlExtracto($: cheerio.CheerioAPI): string | undefined {
  const href = $('a[href*="visualizaExtracto"]').first().attr('href');
  return href || undefined;
}

async function traerHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'ControlPoceados/0.1 (uso personal)',
      'Accept-Language': 'es-AR,es;q=0.9',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`${url} devolvio ${r.status}`);
  return r.text();
}

export const proveedorSantaFe: Proveedor = {
  codigo: 'SANTAFE_WEB',
  juegos: ['QUINI6', 'BRINCO'],

  async listarConcursos(juegoCodigo) {
    // La URL fija devuelve siempre el ultimo. Para el historico habria que ver
    // si la app acepta parametros, pero para controlar jugadas alcanza.
    const s = await this.traerConcurso(juegoCodigo, 0);
    return [{ nro: s.nroConcurso, fecha: s.fecha }];
  },

  async traerConcurso(juegoCodigo, _nro) {
    const url = juegoCodigo === 'BRINCO' ? URL_BRINCO : URL_QUINI6;
    return parsearExtracto(await traerHtml(url), juegoCodigo, 6);
  },
};
