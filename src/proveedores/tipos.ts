/**
 * Contrato de fuentes de resultados.
 *
 * Capa anticorrupción: cada fuente devuelve su HTML o su PDF como quiera,
 * pero acá adentro todas hablan el mismo idioma. Si mañana el sitio oficial
 * cambia el maquetado, se toca un solo archivo y no se cae nada más.
 */

export type CodigoFuente = 'SANTAFE_WEB' | 'EXTRACTO_PDF' | 'TUJUGADA';

export interface EscalonCrudo {
  aciertos: number | null;
  etiqueta: string;
  pozo: number;
  ganadores: number;
  premioUnitario: number;
  vacante: boolean;
}

export interface ResultadoCrudo {
  modalidadCodigo: string;
  numeros: number[];
  plus?: number;
  nivelGanador?: number | null;
  escalones: EscalonCrudo[];
}

export interface SorteoCrudo {
  juegoCodigo: string;
  nroConcurso: number;
  fecha: string; // ISO
  resultados: ResultadoCrudo[];
  urlExtracto?: string;
}

export interface Proveedor {
  codigo: CodigoFuente;
  /** Juegos que esta fuente sabe leer. */
  juegos: string[];
  /** Lista los concursos disponibles, del más nuevo al más viejo. */
  listarConcursos(juegoCodigo: string): Promise<{ nro: number; fecha: string }[]>;
  /** Trae un concurso puntual. Lanza si no lo encuentra. */
  traerConcurso(juegoCodigo: string, nro: number): Promise<SorteoCrudo>;
}

/**
 * Huella del contenido que importa para conciliar: sólo los números.
 * Los montos pueden actualizarse con el correr de las horas sin que
 * eso signifique que las fuentes se contradicen.
 */
export function huellaDe(s: SorteoCrudo): string {
  const partes = s.resultados
    .slice()
    .sort((a, b) => a.modalidadCodigo.localeCompare(b.modalidadCodigo))
    .map(
      (r) =>
        `${r.modalidadCodigo}:${r.numeros.slice().sort((a, b) => a - b).join('-')}` +
        (r.plus !== undefined ? `+${r.plus}` : ''),
    );
  return `${s.juegoCodigo}#${s.nroConcurso}|${partes.join('|')}`;
}
