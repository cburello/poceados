/**
 * Motor de control de jugadas.
 *
 * Función pura: mismos argumentos, mismo resultado. No toca la base ni la red.
 * Se ejecuta igual en el servidor y en el navegador (así la PWA controla offline).
 */

import { getJuego, type Juego, type Modalidad, type TipoModalidad } from '../config/juegos.ts';

export type EstadoPremio =
  | 'GANADOR'
  | 'SIN_PREMIO'
  /** Falta el dato del extracto que define el nivel ganador del concurso. */
  | 'PENDIENTE_EXTRACTO'
  /** El usuario no pagó esta modalidad en el cupón. */
  | 'NO_JUGADA';

export interface Jugada {
  id: string;
  alias: string;
  juegoCodigo: string;
  numeros: number[];
  plus?: number;
  /** Códigos de modalidades opcionales que el usuario pagó. */
  modalidades: string[];
}

export interface EscalonPremio {
  aciertos: number;
  ganadores: number;
  premioUnitario: number;
  vacante: boolean;
}

export interface ResultadoModalidad {
  modalidadCodigo: string;
  numeros: number[];
  plus?: number;
  /**
   * Sólo para MAS_ACIERTOS: con cuántos aciertos salió el concurso.
   * null = todavía no se conoce.
   */
  nivelGanador?: number | null;
  escalones: EscalonPremio[];
}

export interface Sorteo {
  juegoCodigo: string;
  nroConcurso: number;
  fecha: string;
  resultados: ResultadoModalidad[];
}

export interface ControlModalidad {
  modalidadCodigo: string;
  modalidadNombre: string;
  tipo: TipoModalidad;
  /** Los números del sorteo para esta modalidad. */
  numerosSorteo: number[];
  /** Los tuyos que coincidieron. */
  acertados: number[];
  /** Los tuyos que no. */
  fallados: number[];
  aciertos: number;
  estado: EstadoPremio;
  /** Explicación en castellano de por qué ese estado. Va directo a la UI. */
  motivo: string;
  premioUnitario: number;
  plusAcertado: boolean;
}

export interface ControlJugada {
  jugadaId: string;
  alias: string;
  juegoCodigo: string;
  nroConcurso: number;
  fecha: string;
  modalidades: ControlModalidad[];
  totalACobrar: number;
  /** Cantidad de aciertos de la mejor modalidad efectivamente jugada. */
  mejorAciertos: number;
  mejorModalidad: string | null;
  /** true si alguna modalidad quedó esperando el extracto. */
  tienePendientes: boolean;
}

const fmt = (n: number) => n.toLocaleString('es-AR');

/** Números de una modalidad DERIVADA: unión sin repetir de las que la componen. */
function numerosDerivados(mod: Modalidad, sorteo: Sorteo): number[] {
  const fuentes = mod.derivaDe ?? [];
  const set = new Set<number>();
  for (const codigo of fuentes) {
    const r = sorteo.resultados.find((x) => x.modalidadCodigo === codigo);
    if (!r) continue;
    for (const n of r.numeros) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

function controlarModalidad(
  jugada: Jugada,
  juego: Juego,
  mod: Modalidad,
  sorteo: Sorteo,
): ControlModalidad {
  const res = sorteo.resultados.find((x) => x.modalidadCodigo === mod.codigo);

  const numerosSorteo =
    mod.tipo === 'DERIVADA' ? numerosDerivados(mod, sorteo) : (res?.numeros ?? []);

  const acertados = jugada.numeros.filter((n) => numerosSorteo.includes(n));
  const fallados = jugada.numeros.filter((n) => !numerosSorteo.includes(n));
  const aciertos = acertados.length;

  const base = {
    modalidadCodigo: mod.codigo,
    modalidadNombre: mod.nombre,
    tipo: mod.tipo,
    numerosSorteo,
    acertados,
    fallados,
    aciertos,
    plusAcertado: false,
    premioUnitario: 0,
  };

  // ¿La jugó?
  if (mod.opcional && !jugada.modalidades.includes(mod.codigo)) {
    return { ...base, estado: 'NO_JUGADA', motivo: 'No pagaste esta modalidad en el cupón' };
  }

  // ¿Hay resultado cargado?
  if (mod.tipo !== 'DERIVADA' && !res) {
    return { ...base, estado: 'PENDIENTE_EXTRACTO', motivo: 'Todavía no cargamos esta modalidad' };
  }
  if (mod.tipo === 'DERIVADA' && numerosSorteo.length === 0) {
    return { ...base, estado: 'PENDIENTE_EXTRACTO', motivo: 'Faltan los sorteos que la componen' };
  }

  const plusAcertado =
    jugada.plus !== undefined && res?.plus !== undefined && jugada.plus === res.plus;

  // --- MAS_ACIERTOS: el nivel ganador es relativo al resto del país ---
  if (mod.tipo === 'MAS_ACIERTOS') {
    const nivel = res?.nivelGanador;
    if (nivel === null || nivel === undefined) {
      return {
        ...base,
        plusAcertado,
        estado: 'PENDIENTE_EXTRACTO',
        motivo:
          `Con ${aciertos} ${aciertos === 1 ? 'acierto' : 'aciertos'} cobrás sólo si nadie del país ` +
          `hizo más. Falta el extracto oficial para saberlo`,
      };
    }
    if (aciertos === nivel) {
      const esc = res?.escalones.find((e) => e.aciertos === nivel);
      return {
        ...base,
        plusAcertado,
        estado: 'GANADOR',
        premioUnitario: esc?.premioUnitario ?? 0,
        motivo: `El concurso salió con ${nivel} aciertos y llegaste`,
      };
    }
    return {
      ...base,
      plusAcertado,
      estado: 'SIN_PREMIO',
      motivo:
        aciertos < nivel
          ? `El concurso salió con ${nivel} aciertos, hiciste ${aciertos}`
          : `Cantidad no contemplada por el extracto`,
    };
  }

  // --- ESCALONADA y DERIVADA: umbrales fijos ---
  const paganCon = mod.aciertosQuePagan ?? [];
  if (!paganCon.includes(aciertos)) {
    const minimo = Math.min(...paganCon);
    return {
      ...base,
      plusAcertado,
      estado: 'SIN_PREMIO',
      motivo:
        paganCon.length === 1
          ? `Esta modalidad paga sólo con ${minimo} aciertos`
          : `Esta modalidad paga desde ${minimo} aciertos`,
    };
  }

  const escalon = res?.escalones.find((e) => e.aciertos === aciertos);

  if (escalon?.vacante) {
    return {
      ...base,
      plusAcertado,
      estado: 'SIN_PREMIO',
      motivo: `Escalón declarado vacante en el extracto`,
    };
  }
  if (!escalon) {
    return {
      ...base,
      plusAcertado,
      estado: 'PENDIENTE_EXTRACTO',
      motivo: `Llegaste a ${aciertos} aciertos pero falta el monto del extracto`,
    };
  }

  // El Número Plus triplica.
  const multiplicador = plusAcertado ? 3 : 1;
  const premio = escalon.premioUnitario * multiplicador;

  return {
    ...base,
    plusAcertado,
    estado: 'GANADOR',
    premioUnitario: premio,
    motivo: plusAcertado
      ? `${aciertos} aciertos con Número Plus, premio triplicado`
      : `${aciertos} aciertos entre ${fmt(escalon.ganadores)} ganadores`,
  };
}

export function controlarJugada(jugada: Jugada, sorteo: Sorteo): ControlJugada {
  if (jugada.juegoCodigo !== sorteo.juegoCodigo) {
    throw new Error(
      `La jugada es de ${jugada.juegoCodigo} y el sorteo de ${sorteo.juegoCodigo}`,
    );
  }
  const juego = getJuego(jugada.juegoCodigo);

  const modalidades = juego.modalidades
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((m) => controlarModalidad(jugada, juego, m, sorteo));

  // Para "mejor resultado" sólo comparamos modalidades que juegan con los
  // mismos números que el usuario eligió. El Premio Extra sale de 15 bolillas
  // en vez de 6, así que 5 aciertos ahí no valen lo mismo que 5 en Tradicional:
  // compararlos sería mezclar peras con manzanas.
  const comparables = modalidades.filter(
    (m) => m.estado !== 'NO_JUGADA' && m.tipo !== 'DERIVADA',
  );
  const mejor = comparables.reduce<ControlModalidad | null>(
    (acc, m) => (acc === null || m.aciertos > acc.aciertos ? m : acc),
    null,
  );

  return {
    jugadaId: jugada.id,
    alias: jugada.alias,
    juegoCodigo: jugada.juegoCodigo,
    nroConcurso: sorteo.nroConcurso,
    fecha: sorteo.fecha,
    modalidades,
    totalACobrar: modalidades.reduce((s, m) => s + m.premioUnitario, 0),
    mejorAciertos: mejor?.aciertos ?? 0,
    mejorModalidad: mejor?.modalidadNombre ?? null,
    tienePendientes: modalidades.some((m) => m.estado === 'PENDIENTE_EXTRACTO'),
  };
}

/** Valida una jugada antes de guardarla. Devuelve la lista de errores. */
export function validarJugada(jugada: Jugada): string[] {
  const errores: string[] = [];
  const juego = getJuego(jugada.juegoCodigo);

  if (!jugada.alias?.trim()) errores.push('Poné un nombre para reconocer la jugada');

  if (jugada.numeros.length !== juego.cantidadNumeros) {
    errores.push(`${juego.nombre} necesita ${juego.cantidadNumeros} números`);
  }
  if (new Set(jugada.numeros).size !== jugada.numeros.length) {
    errores.push('No se puede repetir un número');
  }
  const fuera = jugada.numeros.filter((n) => n < juego.rangoMin || n > juego.rangoMax);
  if (fuera.length) {
    errores.push(
      `${fuera.join(', ')} fuera del rango ${juego.rangoMin}-${juego.rangoMax}`,
    );
  }
  if (jugada.plus !== undefined) {
    if (!juego.plus) errores.push(`${juego.nombre} no tiene Número Plus`);
    else if (jugada.plus < juego.plus.min || jugada.plus > juego.plus.max) {
      errores.push(`El Número Plus va de ${juego.plus.min} a ${juego.plus.max}`);
    }
  }
  return errores;
}
