/**
 * Tests del motor de control.
 *
 * El caso base usa datos REALES del Quini 6 concurso 3399 (12/08/2026),
 * tomados del sitio oficial de Lotería de Santa Fe. Si alguna vez el
 * motor cambia y estos números dejan de dar, algo se rompió de verdad.
 *
 * Correr con: node --test --experimental-strip-types src/dominio/control.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { controlarJugada, validarJugada, type Sorteo, type Jugada } from './control.ts';

/** Concurso 3399 tal cual el extracto oficial. */
const SORTEO_3399: Sorteo = {
  juegoCodigo: 'QUINI6',
  nroConcurso: 3399,
  fecha: '2026-08-12',
  resultados: [
    {
      modalidadCodigo: 'TRADICIONAL',
      numeros: [23, 24, 25, 30, 31, 44],
      escalones: [
        { aciertos: 6, ganadores: 0, premioUnitario: 0, vacante: true },
        { aciertos: 5, ganadores: 9, premioUnitario: 4_731_004.0, vacante: false },
        { aciertos: 4, ganadores: 527, premioUnitario: 24_238.54, vacante: false },
      ],
    },
    {
      modalidadCodigo: 'SEGUNDA',
      numeros: [4, 8, 16, 20, 24, 36],
      escalones: [
        { aciertos: 6, ganadores: 1, premioUnitario: 1_100_000_000.0, vacante: false },
        { aciertos: 5, ganadores: 107, premioUnitario: 397_934.92, vacante: false },
        { aciertos: 4, ganadores: 2_336, premioUnitario: 5_468.2, vacante: false },
      ],
    },
    {
      modalidadCodigo: 'REVANCHA',
      numeros: [3, 7, 22, 24, 25, 42],
      escalones: [{ aciertos: 6, ganadores: 0, premioUnitario: 0, vacante: true }],
    },
    {
      modalidadCodigo: 'SIEMPRE_SALE',
      numeros: [13, 21, 23, 26, 32, 33],
      nivelGanador: 6,
      escalones: [
        { aciertos: 6, ganadores: 1, premioUnitario: 381_004_236.0, vacante: false },
      ],
    },
  ],
};

const LOS_DEL_CUMPLE: Jugada = {
  id: 'j1',
  alias: 'Los del cumple',
  juegoCodigo: 'QUINI6',
  numeros: [3, 23, 24, 25, 31, 45],
  modalidades: ['REVANCHA'], // pagó Revancha pero NO Siempre Sale
};

test('Tradicional: 4 aciertos pagan el 3er premio', () => {
  const c = controlarJugada(LOS_DEL_CUMPLE, SORTEO_3399);
  const m = c.modalidades.find((x) => x.modalidadCodigo === 'TRADICIONAL')!;
  assert.equal(m.aciertos, 4);
  assert.deepEqual(m.acertados, [23, 24, 25, 31]);
  assert.deepEqual(m.fallados, [3, 45]);
  assert.equal(m.estado, 'GANADOR');
  assert.equal(m.premioUnitario, 24_238.54);
});

test('La Segunda: 1 acierto no paga', () => {
  const c = controlarJugada(LOS_DEL_CUMPLE, SORTEO_3399);
  const m = c.modalidades.find((x) => x.modalidadCodigo === 'SEGUNDA')!;
  assert.equal(m.aciertos, 1);
  assert.equal(m.estado, 'SIN_PREMIO');
  assert.match(m.motivo, /desde 4 aciertos/);
});

test('Revancha: 3 aciertos y sin premio, porque paga sólo con 6', () => {
  const c = controlarJugada(LOS_DEL_CUMPLE, SORTEO_3399);
  const m = c.modalidades.find((x) => x.modalidadCodigo === 'REVANCHA')!;
  assert.equal(m.aciertos, 3);
  assert.deepEqual(m.acertados, [3, 24, 25]);
  assert.equal(m.estado, 'SIN_PREMIO');
  assert.equal(m.premioUnitario, 0);
});

test('Siempre Sale: no jugada, no cuenta para la mejor modalidad', () => {
  const c = controlarJugada(LOS_DEL_CUMPLE, SORTEO_3399);
  const m = c.modalidades.find((x) => x.modalidadCodigo === 'SIEMPRE_SALE')!;
  assert.equal(m.estado, 'NO_JUGADA');
  assert.equal(c.mejorModalidad, 'Tradicional primer sorteo');
});

test('Premio Extra: se deriva de las otras tres, 15 números únicos', () => {
  const c = controlarJugada(LOS_DEL_CUMPLE, SORTEO_3399);
  const m = c.modalidades.find((x) => x.modalidadCodigo === 'PREMIO_EXTRA')!;
  assert.equal(m.numerosSorteo.length, 15, 'el extra del 3399 tiene 15 números únicos');
  assert.deepEqual(
    m.numerosSorteo,
    [3, 4, 7, 8, 16, 20, 22, 23, 24, 25, 30, 31, 36, 42, 44],
  );
  assert.equal(m.aciertos, 5);
  assert.equal(m.estado, 'SIN_PREMIO');
});

test('Total a cobrar es la suma de las modalidades ganadoras', () => {
  const c = controlarJugada(LOS_DEL_CUMPLE, SORTEO_3399);
  assert.equal(c.totalACobrar, 24_238.54);
  assert.equal(c.mejorAciertos, 4);
  assert.equal(c.tienePendientes, false);
});

test('Siempre Sale con 5 aciertos NO paga si el concurso salió con 6', () => {
  const jugada: Jugada = {
    id: 'j2',
    alias: 'Casi',
    juegoCodigo: 'QUINI6',
    numeros: [13, 21, 23, 26, 32, 1], // 5 de los del Siempre Sale
    modalidades: ['SIEMPRE_SALE'],
  };
  const m = controlarJugada(jugada, SORTEO_3399).modalidades.find(
    (x) => x.modalidadCodigo === 'SIEMPRE_SALE',
  )!;
  assert.equal(m.aciertos, 5);
  assert.equal(m.estado, 'SIN_PREMIO');
  assert.match(m.motivo, /salió con 6 aciertos/);
});

test('Siempre Sale queda PENDIENTE si no se conoce el nivel ganador', () => {
  const sinNivel: Sorteo = {
    ...SORTEO_3399,
    resultados: SORTEO_3399.resultados.map((r) =>
      r.modalidadCodigo === 'SIEMPRE_SALE' ? { ...r, nivelGanador: null } : r,
    ),
  };
  const jugada: Jugada = {
    id: 'j3',
    alias: 'Casi',
    juegoCodigo: 'QUINI6',
    numeros: [13, 21, 23, 26, 32, 1],
    modalidades: ['SIEMPRE_SALE'],
  };
  const c = controlarJugada(jugada, sinNivel);
  const m = c.modalidades.find((x) => x.modalidadCodigo === 'SIEMPRE_SALE')!;
  assert.equal(m.estado, 'PENDIENTE_EXTRACTO');
  assert.equal(c.tienePendientes, true);
});

test('Escalón vacante no paga aunque llegues al umbral', () => {
  const jugada: Jugada = {
    id: 'j4',
    alias: 'Los seis',
    juegoCodigo: 'QUINI6',
    numeros: [23, 24, 25, 30, 31, 44], // los 6 de Tradicional, declarado vacante
    modalidades: [],
  };
  const m = controlarJugada(jugada, SORTEO_3399).modalidades.find(
    (x) => x.modalidadCodigo === 'TRADICIONAL',
  )!;
  assert.equal(m.aciertos, 6);
  assert.equal(m.estado, 'SIN_PREMIO');
  assert.match(m.motivo, /vacante/);
});

test('Número Plus triplica el premio', () => {
  const sorteo: Sorteo = {
    juegoCodigo: 'LOTO_PLUS',
    nroConcurso: 3907,
    fecha: '2026-08-08',
    resultados: [
      {
        modalidadCodigo: 'TRADICIONAL',
        numeros: [5, 14, 19, 27, 31, 40],
        plus: 7,
        escalones: [{ aciertos: 4, ganadores: 100, premioUnitario: 1_000, vacante: false }],
      },
    ],
  };
  const conPlus = controlarJugada(
    { id: 'a', alias: 'A', juegoCodigo: 'LOTO_PLUS', numeros: [5, 14, 19, 27, 1, 2], plus: 7, modalidades: [] },
    sorteo,
  );
  const sinPlus = controlarJugada(
    { id: 'b', alias: 'B', juegoCodigo: 'LOTO_PLUS', numeros: [5, 14, 19, 27, 1, 2], plus: 3, modalidades: [] },
    sorteo,
  );
  assert.equal(conPlus.totalACobrar, 3_000);
  assert.equal(sinPlus.totalACobrar, 1_000);
});

test('Validación rechaza jugadas mal armadas', () => {
  const errores = validarJugada({
    id: 'x',
    alias: '',
    juegoCodigo: 'QUINI6',
    numeros: [1, 1, 50, 3, 4],
    modalidades: [],
  });
  assert.ok(errores.some((e) => /nombre/.test(e)));
  assert.ok(errores.some((e) => /6 números/.test(e)));
  assert.ok(errores.some((e) => /repetir/.test(e)));
  assert.ok(errores.some((e) => /fuera del rango/.test(e)));
});
