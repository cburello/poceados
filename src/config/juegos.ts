/**
 * Catálogo de juegos poceados.
 *
 * Esto es configuración, no código: agregar un juego nuevo no debería
 * requerir tocar el motor de control. Si algún día hay que tocarlo,
 * es señal de que falta un `tipo` de modalidad.
 *
 * ATENCIÓN: los rangos de Quini 6 están verificados contra el sitio
 * oficial de Lotería de Santa Fe. Los del resto salen de fuentes
 * secundarias y están marcados como PENDIENTE DE VERIFICAR.
 */

export type TipoModalidad =
  /** Escalones fijos: pagás si llegás al umbral, sin importar el resto del país. */
  | 'ESCALONADA'
  /** Nivel ganador relativo: cobra quien tenga MÁS aciertos del país. */
  | 'MAS_ACIERTOS'
  /** Los números salen de unir otras modalidades del mismo sorteo. */
  | 'DERIVADA';

export interface Modalidad {
  codigo: string;
  nombre: string;
  orden: number;
  tipo: TipoModalidad;
  /** Cantidades de aciertos que pagan. Sólo para ESCALONADA y DERIVADA. */
  aciertosQuePagan?: number[];
  /** Modalidades de las que se derivan los números. Sólo para DERIVADA. */
  derivaDe?: string[];
  /** Si es false, el usuario no la elige: viene incluida en el cupón. */
  opcional: boolean;
}

export interface Juego {
  codigo: string;
  nombre: string;
  rangoMin: number;
  rangoMax: number;
  cantidadNumeros: number;
  /** Días de sorteo, 0 = domingo. */
  diasSorteo: number[];
  horaSorteo: string;
  plus?: { min: number; max: number; nombre: string; descripcion: string };
  modalidades: Modalidad[];
  verificado: boolean;
}

export const JUEGOS: Record<string, Juego> = {
  QUINI6: {
    codigo: 'QUINI6',
    nombre: 'Quini 6',
    rangoMin: 0,
    rangoMax: 45,
    cantidadNumeros: 6,
    diasSorteo: [0, 3],
    horaSorteo: '21:15',
    verificado: true,
    modalidades: [
      {
        codigo: 'TRADICIONAL',
        nombre: 'Tradicional primer sorteo',
        orden: 1,
        tipo: 'ESCALONADA',
        aciertosQuePagan: [6, 5, 4],
        opcional: false,
      },
      {
        codigo: 'SEGUNDA',
        nombre: 'Tradicional la Segunda del Quini',
        orden: 2,
        tipo: 'ESCALONADA',
        aciertosQuePagan: [6, 5, 4],
        opcional: false,
      },
      {
        codigo: 'REVANCHA',
        nombre: 'Revancha',
        orden: 3,
        tipo: 'ESCALONADA',
        aciertosQuePagan: [6],
        opcional: true,
      },
      {
        codigo: 'SIEMPRE_SALE',
        nombre: 'Siempre Sale',
        orden: 4,
        tipo: 'MAS_ACIERTOS',
        opcional: true,
      },
      {
        codigo: 'PREMIO_EXTRA',
        nombre: 'Premio Extra',
        orden: 5,
        tipo: 'DERIVADA',
        derivaDe: ['TRADICIONAL', 'SEGUNDA', 'REVANCHA'],
        aciertosQuePagan: [6],
        opcional: false,
      },
    ],
  },

  // PENDIENTE DE VERIFICAR contra reglamento oficial de LOTBA.
  LOTO_PLUS: {
    codigo: 'LOTO_PLUS',
    nombre: 'Loto Plus',
    rangoMin: 0,
    rangoMax: 45,
    cantidadNumeros: 6,
    diasSorteo: [3, 6],
    horaSorteo: '22:00',
    verificado: false,
    plus: {
      min: 0,
      max: 9,
      nombre: 'Número Plus',
      descripcion: 'Si lo acertás, tu premio se triplica',
    },
    modalidades: [
      { codigo: 'TRADICIONAL', nombre: 'Tradicional', orden: 1, tipo: 'ESCALONADA', aciertosQuePagan: [6, 5, 4], opcional: false },
      { codigo: 'MATCH', nombre: 'Match', orden: 2, tipo: 'ESCALONADA', aciertosQuePagan: [6, 5, 4], opcional: true },
      { codigo: 'DESQUITE', nombre: 'Desquite', orden: 3, tipo: 'ESCALONADA', aciertosQuePagan: [6], opcional: true },
      { codigo: 'SALE_O_SALE', nombre: 'Sale o Sale', orden: 4, tipo: 'MAS_ACIERTOS', opcional: true },
    ],
  },

  // PENDIENTE DE VERIFICAR.
  BRINCO: {
    codigo: 'BRINCO',
    nombre: 'Brinco',
    rangoMin: 0,
    rangoMax: 39,
    cantidadNumeros: 6,
    diasSorteo: [0],
    horaSorteo: '21:00',
    verificado: false,
    modalidades: [
      { codigo: 'TRADICIONAL', nombre: 'Brinco', orden: 1, tipo: 'ESCALONADA', aciertosQuePagan: [6, 5, 4], opcional: false },
      { codigo: 'JUNIOR', nombre: 'Brinco Junior', orden: 2, tipo: 'ESCALONADA', aciertosQuePagan: [6], opcional: false },
    ],
  },

  // PENDIENTE DE VERIFICAR.
  TELEKINO: {
    codigo: 'TELEKINO',
    nombre: 'Telekino',
    rangoMin: 1,
    rangoMax: 25,
    cantidadNumeros: 15,
    diasSorteo: [0],
    horaSorteo: '12:00',
    verificado: false,
    modalidades: [
      { codigo: 'TRADICIONAL', nombre: 'Telekino', orden: 1, tipo: 'ESCALONADA', aciertosQuePagan: [15, 14, 13, 12], opcional: false },
      { codigo: 'REKINO', nombre: 'Rekino', orden: 2, tipo: 'ESCALONADA', aciertosQuePagan: [15], opcional: false },
    ],
  },
};

export function getJuego(codigo: string): Juego {
  const j = JUEGOS[codigo];
  if (!j) throw new Error(`Juego desconocido: ${codigo}`);
  return j;
}

export function getModalidad(juego: Juego, codigo: string): Modalidad {
  const m = juego.modalidades.find((x) => x.codigo === codigo);
  if (!m) throw new Error(`Modalidad ${codigo} no existe en ${juego.codigo}`);
  return m;
}
