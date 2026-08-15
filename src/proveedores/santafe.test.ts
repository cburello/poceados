/**
 * Tests del parser contra HTML real capturado del sitio.
 *
 * El fixture sale de la respuesta viva del servidor de extractos, no de un
 * ejemplo inventado. Si el sitio cambia el maquetado, estos tests fallan y
 * nos enteramos acá en vez de en producción con datos mal cargados.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsearExtracto, aNumero, codigoDeTitulo } from './santafe.ts';

const html = readFileSync(
  new URL('./fixtures/quini6-3399.html', import.meta.url),
  'utf8',
);

test('reconoce las modalidades por palabra clave', () => {
  assert.equal(codigoDeTitulo('Tradicional Primer Sorteo'), 'TRADICIONAL');
  assert.equal(codigoDeTitulo('Tradicional La Segunda del Quini'), 'SEGUNDA');
  assert.equal(codigoDeTitulo('REVANCHA'), 'REVANCHA');
  assert.equal(codigoDeTitulo('Siempre Sale'), 'SIEMPRE_SALE');
  assert.equal(codigoDeTitulo('Premio Extra'), null, 'el extra lo calculamos nosotros');
});

test('convierte montos con formato argentino', () => {
  assert.equal(aNumero('7.282.064.412,00'), 7282064412);
  assert.equal(aNumero('24.238,54'), 24238.54);
  assert.equal(aNumero('527'), 527);
  assert.equal(aNumero(''), 0);
});

test('saca los números del Tradicional', () => {
  const s = parsearExtracto(html, 'QUINI6');
  const t = s.resultados.find((r) => r.modalidadCodigo === 'TRADICIONAL')!;
  assert.deepEqual(t.numeros, [23, 24, 25, 30, 31, 44]);
});

test('deduce los aciertos del orden del premio', () => {
  const s = parsearExtracto(html, 'QUINI6');
  const t = s.resultados.find((r) => r.modalidadCodigo === 'TRADICIONAL')!;
  assert.equal(t.escalones.find((e) => e.aciertos === 6)?.vacante, true);
  assert.equal(t.escalones.find((e) => e.aciertos === 5)?.ganadores, 9);
  assert.equal(t.escalones.find((e) => e.aciertos === 5)?.premioUnitario, 4731004);
  assert.equal(t.escalones.find((e) => e.aciertos === 4)?.premioUnitario, 24238.54);
});

test('el escalón vacante queda en cero, no en NaN', () => {
  const s = parsearExtracto(html, 'QUINI6');
  const t = s.resultados.find((r) => r.modalidadCodigo === 'TRADICIONAL')!;
  const primero = t.escalones.find((e) => e.aciertos === 6)!;
  assert.equal(primero.ganadores, 0);
  assert.equal(primero.premioUnitario, 0);
  assert.equal(primero.pozo, 7282064412, 'el pozo vacante sí se conserva');
});

test('Siempre Sale usa su columna Aciertos y fija el nivel ganador', () => {
  const s = parsearExtracto(html, 'QUINI6');
  const ss = s.resultados.find((r) => r.modalidadCodigo === 'SIEMPRE_SALE')!;
  assert.deepEqual(ss.numeros, [13, 21, 23, 26, 32, 33]);
  assert.equal(ss.nivelGanador, 6, 'el 3399 salió con 6 aciertos');
  assert.equal(ss.escalones.find((e) => e.aciertos === 6)?.premioUnitario, 381004236);
  assert.equal(ss.escalones.find((e) => e.aciertos === 0)?.ganadores, 1, 'el estímulo va a los de 0');
});

test('el concurso sale del select de sorteos, no de un título', () => {
  const s = parsearExtracto(html, 'QUINI6');
  assert.equal(s.nroConcurso, 3399, 'primera opción: "Miércoles 12 - 3399"');
});

test('la fecha se arma juntando los dos selectores', () => {
  // El HTML no tiene ninguna fecha completa: el mes viene de un select
  // ("Agosto 2026") y el día del otro ("Miércoles 12 - 3399").
  const s = parsearExtracto(html, 'QUINI6');
  assert.equal(s.fecha, '2026-08-12');
});

test('captura el enlace al extracto oficial en PDF', () => {
  const s = parsearExtracto(html, 'QUINI6');
  assert.match(s.urlExtracto ?? '', /param_ID_sor=4003399/);
});

test('si no reconoce nada, avisa en vez de devolver vacío', () => {
  assert.throws(() => parsearExtracto('<html><body>nada</body></html>', 'QUINI6'), /maquetado/);
});
