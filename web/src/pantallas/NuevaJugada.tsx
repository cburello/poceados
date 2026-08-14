import { useState } from 'react';
import type { Juego } from '@dominio/config/juegos.ts';
import { validarJugada } from '@dominio/dominio/control.ts';
import { almacen, nuevoId, type JugadaGuardada } from '../datos/almacen.ts';
import { COLOR_JUEGO } from '../componentes/ui.tsx';

export function NuevaJugada({
  juegos,
  onGuardada,
  onPaso,
}: {
  juegos: Juego[];
  onGuardada: () => void;
  onPaso: (paso: number, titulo: string, bajada: string) => void;
}) {
  const [paso, setPaso] = useState(1);
  const [juego, setJuego] = useState<Juego | null>(null);
  const [numeros, setNumeros] = useState<number[]>([]);
  const [plus, setPlus] = useState<number | undefined>();
  const [modalidades, setModalidades] = useState<string[]>([]);
  const [alias, setAlias] = useState('');
  const [costo, setCosto] = useState('3000');
  const [errores, setErrores] = useState<string[]>([]);

  function irA(n: number, j?: Juego) {
    const jj = j ?? juego;
    setPaso(n);
    if (n === 1) onPaso(1, 'Elegí el juego', 'Paso 1 de 3');
    if (n === 2) onPaso(2, `Elegí ${jj?.cantidadNumeros} números`, 'Paso 2 de 3');
    if (n === 3) onPaso(3, 'Modalidades y nombre', 'Paso 3 de 3');
  }

  function elegirJuego(j: Juego) {
    setJuego(j);
    setNumeros([]);
    setPlus(undefined);
    setModalidades(j.modalidades.filter((m) => !m.opcional).map((m) => m.codigo));
    irA(2, j);
  }

  function tocarNumero(n: number) {
    if (!juego) return;
    setNumeros((prev) =>
      prev.includes(n)
        ? prev.filter((x) => x !== n)
        : prev.length < juego.cantidadNumeros
          ? [...prev, n].sort((a, b) => a - b)
          : prev,
    );
  }

  function alAzar() {
    if (!juego) return;
    const pool: number[] = [];
    for (let i = juego.rangoMin; i <= juego.rangoMax; i++) pool.push(i);
    const elegidos: number[] = [];
    while (elegidos.length < juego.cantidadNumeros) {
      const i = Math.floor(Math.random() * pool.length);
      elegidos.push(pool.splice(i, 1)[0]!);
    }
    setNumeros(elegidos.sort((a, b) => a - b));
  }

  async function guardar() {
    if (!juego) return;
    const jugada: JugadaGuardada = {
      id: nuevoId(),
      alias: alias.trim(),
      juegoCodigo: juego.codigo,
      numeros,
      plus,
      modalidades,
      creadaEn: new Date().toISOString(),
      archivada: false,
      costoPorSorteo: Number.parseFloat(costo) || 0,
    };
    const errs = validarJugada(jugada);
    if (errs.length) return setErrores(errs);
    await almacen.guardarJugada(jugada);
    onGuardada();
  }

  // --- Paso 1: juego ---
  if (paso === 1) {
    return (
      <div className="pad">
        <p className="hint" style={{ margin: '0 0 16px' }}>
          Elegí el juego. Cada uno tiene su propio rango de números y sus modalidades.
        </p>
        {juegos.map((j) => (
          <button key={j.codigo} className="row" onClick={() => elegirJuego(j)}>
            <div>
              <div className="t">{j.nombre}</div>
              <div className="s">
                {j.cantidadNumeros} números del {String(j.rangoMin).padStart(2, '0')} al{' '}
                {j.rangoMax}
                {j.plus ? ` + ${j.plus.nombre}` : ''}
                {!j.verificado && ' · datos sin verificar'}
              </div>
            </div>
            <span
              className="dot"
              style={{ background: COLOR_JUEGO[j.codigo] ?? 'var(--ink)' }}
            />
          </button>
        ))}
      </div>
    );
  }

  if (!juego) return null;

  // --- Paso 2: números ---
  if (paso === 2) {
    const celdas: number[] = [];
    for (let i = juego.rangoMin; i <= juego.rangoMax; i++) celdas.push(i);
    const completo = numeros.length === juego.cantidadNumeros;

    return (
      <div className="pad">
        <div className="counter">
          <span className="eyebrow">Seleccionados</span>
          <b className="mono">
            {numeros.length} / {juego.cantidadNumeros}
          </b>
        </div>

        <div className="grid">
          {celdas.map((n) => (
            <button
              key={n}
              aria-pressed={numeros.includes(n)}
              onClick={() => tocarNumero(n)}
            >
              {String(n).padStart(2, '0')}
            </button>
          ))}
        </div>

        {juego.plus && (
          <>
            <div className="rulehead">
              <span>{juego.plus.nombre} — opcional</span>
            </div>
            <p className="hint" style={{ margin: '0 0 10px' }}>
              {juego.plus.descripcion}.
            </p>
            <div className="grid plus">
              {Array.from({ length: juego.plus.max - juego.plus.min + 1 }, (_, i) => (
                <button
                  key={i}
                  aria-pressed={plus === i + juego.plus!.min}
                  onClick={() =>
                    setPlus(plus === i + juego.plus!.min ? undefined : i + juego.plus!.min)
                  }
                >
                  {i + juego.plus!.min}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="btnrow">
          <button className="btn ghost" style={{ flex: '0 0 40%' }} onClick={alAzar}>
            Al azar
          </button>
          <button className="btn" disabled={!completo} onClick={() => irA(3)}>
            Continuar
          </button>
        </div>
      </div>
    );
  }

  // --- Paso 3: modalidades y nombre ---
  const opcionales = juego.modalidades.filter((m) => m.opcional);
  const incluidas = juego.modalidades.filter((m) => !m.opcional);

  return (
    <div className="pad">
      <p className="hint" style={{ margin: '0 0 6px' }}>
        Marcá sólo las modalidades que pagaste en la agencia. Si marcás de más, la app te va a
        avisar de premios que no jugaste.
      </p>

      <div className="rulehead">
        <span>Incluidas en el cupón</span>
      </div>
      {incluidas.map((m) => (
        <div key={m.codigo} className="check" style={{ opacity: 0.55 }}>
          <span className="box">✓</span>
          <span>
            <span className="t">{m.nombre}</span>
            <span className="s">
              {m.tipo === 'DERIVADA'
                ? 'Se arma con los números de los otros sorteos'
                : `Paga desde ${Math.min(...(m.aciertosQuePagan ?? [0]))} aciertos`}
            </span>
          </span>
        </div>
      ))}

      {opcionales.length > 0 && (
        <>
          <div className="rulehead">
            <span>Las que pagaste aparte</span>
          </div>
          {opcionales.map((m) => (
            <button
              key={m.codigo}
              className="check"
              aria-pressed={modalidades.includes(m.codigo)}
              onClick={() =>
                setModalidades((prev) =>
                  prev.includes(m.codigo)
                    ? prev.filter((x) => x !== m.codigo)
                    : [...prev, m.codigo],
                )
              }
            >
              <span className="box">✓</span>
              <span>
                <span className="t">{m.nombre}</span>
                <span className="s">
                  {m.tipo === 'MAS_ACIERTOS'
                    ? 'Va a quienes tengan más aciertos del país'
                    : `Paga sólo con ${Math.min(...(m.aciertosQuePagan ?? [0]))} aciertos`}
                </span>
              </span>
            </button>
          ))}
        </>
      )}

      <div className="rulehead">
        <span>Identificación</span>
      </div>
      <div className="field">
        <label htmlFor="alias">Nombre de la jugada</label>
        <input
          id="alias"
          type="text"
          placeholder="Los del cumple"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
        />
        <p className="hint">
          Ponele un nombre que reconozcas. Seis jugadas sin nombre son seis filas de números
          iguales.
        </p>
      </div>

      <div className="field">
        <label htmlFor="costo">Cuánto te salió el cupón, por sorteo</label>
        <input
          id="costo"
          type="number"
          inputMode="decimal"
          value={costo}
          onChange={(e) => setCosto(e.target.value)}
        />
        <p className="hint">Sirve para el balance entre lo que ponés y lo que cobrás.</p>
      </div>

      {errores.length > 0 && (
        <div className="error">
          <p>No se pudo guardar:</p>
          <ul>
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <button className="btn" onClick={guardar}>
        Guardar jugada
      </button>
    </div>
  );
}
