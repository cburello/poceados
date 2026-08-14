/**
 * Fuente primaria: sitio oficial de Lotería de Santa Fe.
 *
 * La página de resultados tiene dos selects encadenados (mes y concurso) y
 * un enlace al extracto oficial en PDF. Cada modalidad es un bloque con una
 * fila de bolillas y abajo la tabla de premios.
 *
 * OJO: los selectores de acá son una primera aproximación armada leyendo el
 * maquetado. Hay que correr `npm run verificar:santafe` contra la página real
 * y ajustarlos antes de confiar en esto. Los tests con HTML fijo van en
 * test/fixtures para que un cambio del sitio se detecte solo.
 */

import * as cheerio from 'cheerio';
import type { Proveedor, SorteoCrudo, ResultadoCrudo, EscalonCrudo } from './tipos.ts';

const BASE = 'https://www.loteriasantafe.gov.ar';
const RESULTADOS = `${BASE}/index.php/resultados/quini-6?view=resultados`;

/** Los encabezados naranjas del sitio, mapeados a nuestros códigos. */
const MAPA_MODALIDADES: Record<string, string> = {
  'TRADICIONAL PRIMER SORTEO': 'TRADICIONAL',
  'TRADICIONAL LA SEGUNDA DEL QUINI': 'SEGUNDA',
  REVANCHA: 'REVANCHA',
  'SIEMPRE SALE': 'SIEMPRE_SALE',
  'PREMIO EXTRA': 'PREMIO_EXTRA',
};

/** "4.731.004,00" -> 4731004 */
function aNumero(txt: string): number {
  const limpio = txt.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}

/** "1° Premio" -> 6 aciertos, según cuántos números tenga el juego. */
function aciertosDeEtiqueta(etiqueta: string, cantidadNumeros: number): number | null {
  const m = etiqueta.match(/(\d+)\s*°/);
  if (!m) return null; // Estímulo y similares
  const orden = Number.parseInt(m[1], 10);
  return cantidadNumeros - (orden - 1);
}

async function traerHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      // Identificarse es lo correcto: si molestamos, que puedan pedirnos parar.
      'User-Agent': 'ControlPoceados/0.1 (uso personal; contacto en el repo)',
      'Accept-Language': 'es-AR,es;q=0.9',
    },
  });
  if (!r.ok) throw new Error(`${url} devolvió ${r.status}`);
  return r.text();
}

export function parsearQuini6(html: string, nroConcurso: number, fecha: string): SorteoCrudo {
  const $ = cheerio.load(html);
  const resultados: ResultadoCrudo[] = [];

  $('table').each((_, tabla) => {
    const $t = $(tabla);
    const titulo = $t.find('th, .titulo-modalidad').first().text().trim().toUpperCase();
    const codigo = MAPA_MODALIDADES[titulo];
    if (!codigo) return;

    // Fila de bolillas: la primera fila de celdas que son todas numéricas.
    const numeros: number[] = [];
    $t.find('tr').each((__, fila) => {
      if (numeros.length) return;
      const celdas = $(fila).find('td').map((___, c) => $(c).text().trim()).get();
      if (celdas.length >= 5 && celdas.every((c) => /^\d{1,2}$/.test(c))) {
        numeros.push(...celdas.map((c) => Number.parseInt(c, 10)));
      }
    });
    if (!numeros.length) return;

    // Tabla de premios.
    const escalones: EscalonCrudo[] = [];
    let nivelGanador: number | null | undefined;

    $t.find('tr').each((__, fila) => {
      const celdas = $(fila).find('td').map((___, c) => $(c).text().trim()).get();
      if (celdas.length < 3) return;
      const etiqueta = celdas[0];
      if (!/premio|estímulo|estimulo/i.test(etiqueta)) return;

      // Siempre Sale trae una columna extra "ACIERTOS".
      const esSiempreSale = codigo === 'SIEMPRE_SALE';
      const pozo = aNumero(celdas[1]);
      const aciertosCol = esSiempreSale ? Number.parseInt(celdas[2], 10) : NaN;
      const ganadoresTxt = esSiempreSale ? celdas[3] : celdas[2];
      const premioTxt = esSiempreSale ? celdas[4] : celdas[3];

      const vacante = /vacante/i.test(ganadoresTxt ?? '');
      const ganadores = vacante ? 0 : aNumero(ganadoresTxt ?? '0');
      const aciertos = esSiempreSale
        ? Number.isFinite(aciertosCol) ? aciertosCol : null
        : aciertosDeEtiqueta(etiqueta, 6);

      if (esSiempreSale && /1\s*°/.test(etiqueta) && Number.isFinite(aciertosCol)) {
        nivelGanador = aciertosCol;
      }

      escalones.push({
        aciertos,
        etiqueta,
        pozo,
        ganadores,
        premioUnitario: vacante ? 0 : aNumero(premioTxt ?? '0'),
        vacante,
      });
    });

    resultados.push({ modalidadCodigo: codigo, numeros, nivelGanador, escalones });
  });

  if (!resultados.length) {
    throw new Error(
      `No se reconoció ninguna modalidad en el concurso ${nroConcurso}. ` +
        `Probablemente cambió el maquetado del sitio.`,
    );
  }

  // El Premio Extra lo calculamos, no lo leemos: es la unión de las tres
  // primeras modalidades. Menos superficie de error.
  return {
    juegoCodigo: 'QUINI6',
    nroConcurso,
    fecha,
    resultados: resultados.filter((r) => r.modalidadCodigo !== 'PREMIO_EXTRA'),
  };
}

export const proveedorSantaFe: Proveedor = {
  codigo: 'SANTAFE_WEB',
  juegos: ['QUINI6', 'BRINCO'],

  async listarConcursos(juegoCodigo) {
    if (juegoCodigo !== 'QUINI6') throw new Error(`${juegoCodigo} no soportado todavía`);
    const html = await traerHtml(RESULTADOS);
    const $ = cheerio.load(html);
    const items: { nro: number; fecha: string }[] = [];

    // El select de sorteos trae opciones tipo "Miércoles 12 - 3399".
    $('select option').each((_, op) => {
      const txt = $(op).text().trim();
      const m = txt.match(/(\d{1,2})\s*-\s*(\d{3,5})/);
      if (m) items.push({ nro: Number.parseInt(m[2], 10), fecha: '' });
    });
    return items.sort((a, b) => b.nro - a.nro);
  },

  async traerConcurso(juegoCodigo, nro) {
    if (juegoCodigo !== 'QUINI6') throw new Error(`${juegoCodigo} no soportado todavía`);
    const html = await traerHtml(`${RESULTADOS}&sorteo=${nro}`);
    return parsearQuini6(html, nro, new Date().toISOString().slice(0, 10));
  },
};
