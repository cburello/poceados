/**
 * Tests del proveedor de Loto Plus contra la respuesta real del endpoint.
 * Fixture: sorteo 3908 del 12/08/2026.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsearLotba, extraerVariable } from './lotba.ts';
import { controlarJugada, type Jugada } from '../dominio/control.ts';

const js = readFileSync(new URL('./fixtures/loto-3908.js', import.meta.url), 'utf8');

test('recorta el envoltorio window.X = ... y parsea el JSON', () => {
  const d = extraerVariable<any[]>(js, 'RESULTADOS_DATA');
  assert.equal(d?.[0].sorteo, 3908);
});

test('devuelve null si la variable no existe, sin explotar', () => {
  assert.equal(extraerVariable(js, 'NO_EXISTE'), null);
});

test('saca las cuatro modalidades con sus números', () => {
  const s = parsearLotba(js);
  assert.equal(s.nroConcurso, 3908);
  assert.equal(s.fecha, '2026-08-12');
  assert.equal(s.resultados.length, 4, 'el Número Plus no es una modalidad');

  const t = s.resultados.find((r) => r.modalidadCodigo === 'TRADICIONAL')!;
  assert.deepEqual(t.numeros, [2, 4, 7, 14, 30, 43]);
  assert.equal(t.plus, 3, 'el Número Plus del sorteo');
});

test('el cero se lee como cero, no se pierde', () => {
  // Desquite empieza con "00": si el parseo fuera flojo, quedaría NaN.
  const s = parsearLotba(js);
  const d = s.resultados.find((r) => r.modalidadCodigo === 'DESQUITE')!;
  assert.deepEqual(d.numeros, [0, 2, 7, 10, 20, 27]);
});

test('VACANTE viene como texto y se convierte en cero', () => {
  const s = parsearLotba(js);
  const t = s.resultados.find((r) => r.modalidadCodigo === 'TRADICIONAL')!;
  const seis = t.escalones.find((e) => e.aciertos === 6)!;
  assert.equal(seis.vacante, true);
  assert.equal(seis.ganadores, 0);
  assert.equal(seis.premioUnitario, 0);
  assert.equal(seis.pozo, 3375366747.66, 'el pozo vacante sí se conserva');
});

test('Sale o Sale: LOTBA publica sólo el nivel ganador', () => {
  const s = parsearLotba(js);
  const ss = s.resultados.find((r) => r.modalidadCodigo === 'SALE_O_SALE')!;
  assert.equal(ss.nivelGanador, 5, 'el 3908 salió con 5 aciertos');
  assert.equal(ss.escalones[0]?.ganadores, 1);
  assert.equal(ss.escalones[0]?.premioUnitario, 38079252);
});

test('control de punta a punta contra el sorteo real', () => {
  const sorteo = parsearLotba(js);
  const jugada: Jugada = {
    id: 'x',
    alias: 'Prueba',
    juegoCodigo: 'LOTO_PLUS',
    numeros: [2, 4, 7, 14, 30, 1], // 5 de Tradicional
    plus: 3, // acertado, triplica
    modalidades: [],
  };
  const c = controlarJugada(jugada, {
    juegoCodigo: 'LOTO_PLUS',
    nroConcurso: sorteo.nroConcurso,
    fecha: sorteo.fecha,
    resultados: sorteo.resultados.map((r) => ({
      modalidadCodigo: r.modalidadCodigo,
      numeros: r.numeros,
      plus: r.plus,
      nivelGanador: r.nivelGanador,
      escalones: r.escalones.map((e) => ({
        aciertos: e.aciertos!,
        ganadores: e.ganadores,
        premioUnitario: e.premioUnitario,
        vacante: e.vacante,
      })),
    })),
  });

  const t = c.modalidades.find((m) => m.modalidadCodigo === 'TRADICIONAL')!;
  assert.equal(t.aciertos, 5);
  assert.equal(t.estado, 'GANADOR');
  assert.equal(t.plusAcertado, true);
  assert.equal(t.premioUnitario, 2463951.6 * 3, 'el Número Plus triplica');

  // Ninguna modalidad puede quedar NO_JUGADA: en Loto Plus vienen todas.
  assert.ok(c.modalidades.every((m) => m.estado !== 'NO_JUGADA'));
});
