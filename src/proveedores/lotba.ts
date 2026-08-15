/**
 * Fuente para Loto Plus: Lotería de la Ciudad (LOTBA).
 *
 * A diferencia de Santa Fe, acá no hay que scrapear HTML. El sitio carga los
 * resultados desde un endpoint que devuelve un archivo JavaScript con los datos
 * ya estructurados:
 *
 *   window.RESULTADOS_DATA = [{ sorteo, fecha, numeros_juegos: {...} }];
 *   window.PREMIOS_DATA    = [{ ..., juegos: [{ juego, niveles: [...] }] }];
 *   window.POZO_ULTIMO_SORTEO = 19233000000;
 *
 * Hay que recortar el envoltorio `window.X = ` y el `;` final antes de parsear.
 *
 * OJO: es un endpoint interno del sitio, no una API pública documentada. Puede
 * cambiar sin aviso. Por eso el fixture y los tests: si cambia el formato nos
 * enteramos por un test rojo y no por datos mal cargados en la base.
 */

import type { Proveedor, SorteoCrudo, ResultadoCrudo, EscalonCrudo } from './tipos.ts';

const BASE = 'https://loto.loteriadelaciudad.gob.ar';
export const urlDatos = (sorteo: number) =>
  `${BASE}/includes/resultados-data.php?sorteo=${sorteo}`;

/** Los nombres que usa LOTBA, mapeados a nuestros códigos. */
const MAPA: Record<string, string> = {
  Tradicional: 'TRADICIONAL',
  Match: 'MATCH',
  Desquite: 'DESQUITE',
  'Sale o Sale': 'SALE_O_SALE',
};

const NOMBRE_PLUS = 'Número Plus';

interface NivelLotba {
  aciertos: number;
  label: string;
  pozo: number;
  ganadores: number | string;
  premio_unid: number;
}

interface JuegoLotba {
  codigo: string;
  juego: string;
  niveles: NivelLotba[];
}

interface PremiosLotba {
  sorteo: number;
  fecha: string;
  numeros_juegos: Record<string, string[]>;
  juegos: JuegoLotba[];
  archivos?: Record<string, string>;
}

/** Recorta `window.NOMBRE = <json>;` y devuelve el objeto. */
export function extraerVariable<T>(js: string, nombre: string): T | null {
  const marca = `window.${nombre}`;
  const i = js.indexOf(marca);
  if (i === -1) return null;

  const desde = js.indexOf('=', i) + 1;
  // Recorremos contando llaves y corchetes para encontrar dónde termina,
  // en vez de cortar en el primer `;` (que puede aparecer adentro de un string).
  let nivel = 0;
  let enTexto = false;
  let escape = false;
  let inicio = -1;

  for (let k = desde; k < js.length; k++) {
    const c = js[k]!;
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { enTexto = !enTexto; continue; }
    if (enTexto) continue;

    if (c === '[' || c === '{') {
      if (nivel === 0) inicio = k;
      nivel++;
    } else if (c === ']' || c === '}') {
      nivel--;
      if (nivel === 0 && inicio !== -1) {
        try {
          return JSON.parse(js.slice(inicio, k + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** "12/08/2026" -> "2026-08-12" */
function aIso(fecha: string): string {
  const m = fecha.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : new Date().toISOString().slice(0, 10);
}

export function parsearLotba(js: string): SorteoCrudo {
  const premios = extraerVariable<PremiosLotba[]>(js, 'PREMIOS_DATA');
  if (!premios?.length || !premios[0]) {
    throw new Error('No se encontró PREMIOS_DATA. Cambió el formato del endpoint de LOTBA.');
  }
  const p = premios[0];

  // El Número Plus del sorteo viene como una "modalidad" más en numeros_juegos.
  const plusArr = p.numeros_juegos[NOMBRE_PLUS];
  const plus = plusArr?.[0] !== undefined ? Number.parseInt(plusArr[0], 10) : undefined;

  const resultados: ResultadoCrudo[] = [];

  for (const [nombre, numerosTxt] of Object.entries(p.numeros_juegos)) {
    const codigo = MAPA[nombre];
    if (!codigo) continue; // el Número Plus no es una modalidad para nosotros

    const numeros = numerosTxt.map((n) => Number.parseInt(n, 10));
    const juego = p.juegos.find((j) => j.juego === nombre);

    const escalones: EscalonCrudo[] =
      juego?.niveles.map((n) => {
        const vacante = typeof n.ganadores === 'string' && /VACANTE/i.test(n.ganadores);
        return {
          aciertos: n.aciertos,
          etiqueta: n.label,
          pozo: n.pozo,
          ganadores: vacante ? 0 : Number(n.ganadores),
          premioUnitario: vacante ? 0 : n.premio_unid,
          vacante,
        };
      }) ?? [];

    // En Sale o Sale LOTBA publica un solo nivel: justamente el ganador.
    // Ese dato es el que Quini 6 nos obliga a deducir de una columna aparte.
    const nivelGanador =
      codigo === 'SALE_O_SALE' ? (juego?.niveles[0]?.aciertos ?? null) : undefined;

    resultados.push({
      modalidadCodigo: codigo,
      numeros,
      plus: codigo === 'TRADICIONAL' ? plus : undefined,
      nivelGanador,
      escalones,
    });
  }

  if (!resultados.length) {
    throw new Error('PREMIOS_DATA no trajo ninguna modalidad conocida.');
  }

  return {
    juegoCodigo: 'LOTO_PLUS',
    nroConcurso: p.sorteo,
    fecha: aIso(p.fecha),
    resultados,
    urlExtracto: p.archivos?.extracto ? `${BASE}/${p.archivos.extracto}` : undefined,
  };
}

async function traer(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'ControlPoceados/0.1 (uso personal)',
      'Accept-Language': 'es-AR,es;q=0.9',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`${url} devolvió ${r.status}`);
  return r.text();
}

export const proveedorLotba: Proveedor = {
  codigo: 'LOTBA_WEB',
  juegos: ['LOTO_PLUS'],

  async listarConcursos() {
    // La home trae el select con el histórico. Con pedir el último alcanza
    // para el uso normal; el resto se puede traer por número.
    const html = await traer(`${BASE}/`);
    const nros = [...html.matchAll(/Sorteo\s*N[°º]\s*(\d{3,5})/g)].map((m) =>
      Number.parseInt(m[1]!, 10),
    );
    return [...new Set(nros)].sort((a, b) => b - a).map((nro) => ({ nro, fecha: '' }));
  },

  async traerConcurso(_juegoCodigo, nro) {
    // Sin número pedimos el último que anuncie la home.
    let sorteo = nro;
    if (!sorteo) {
      const lista = await this.listarConcursos('LOTO_PLUS');
      sorteo = lista[0]?.nro ?? 0;
      if (!sorteo) throw new Error('No se pudo determinar el último sorteo de Loto Plus');
    }
    return parsearLotba(await traer(urlDatos(sorteo)));
  },
};
