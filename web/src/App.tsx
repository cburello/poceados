import { useEffect, useMemo, useState } from 'react';
import type { Juego } from '@dominio/config/juegos.ts';
import { controlarJugada, type ControlJugada, type Sorteo } from '@dominio/dominio/control.ts';
import { almacen, type JugadaGuardada } from './datos/almacen.ts';
import { api } from './datos/api.ts';
import { NuevaJugada } from './pantallas/NuevaJugada.tsx';
import {
  Bolas,
  Encabezado,
  FichaModalidad,
  Nota,
  Talon,
  Vacio,
  COLOR_JUEGO,
  pesos,
  fechaLocal,
} from './componentes/ui.tsx';

type Raiz = 'hoy' | 'jugadas' | 'resultados' | 'ajustes';
type Vista =
  | { t: 'raiz'; raiz: Raiz }
  | { t: 'nueva' }
  | { t: 'detalle'; jugadaId: string }
  | { t: 'sorteo'; juego: string; nro: number };

export default function App() {
  const [vista, setVista] = useState<Vista>({ t: 'raiz', raiz: 'hoy' });
  const [pila, setPila] = useState<Vista[]>([]);
  const [titulo, setTitulo] = useState({ h: 'Hoy', e: '' });
  const [paso, setPaso] = useState(0);

  const [juegos, setJuegos] = useState<Juego[]>([]);
  const [sorteos, setSorteos] = useState<Sorteo[]>([]);
  const [jugadas, setJugadas] = useState<JugadaGuardada[]>([]);
  const [offline, setOffline] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  async function recargar() {
    setCargando(true);
    try {
      const [j, s] = await Promise.all([api.juegos(), api.sorteos(50)]);
      setJuegos(j.juegos);
      setSorteos(s.sorteos);
      setOffline(j.deCache || s.deCache);
    } catch {
      setOffline(true);
    }
    setJugadas(await almacen.listarJugadas());
    setCargando(false);
  }

  useEffect(() => {
    void recargar();
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3200);
    return () => clearTimeout(t);
  }, [aviso]);

  /** Control de cada jugada contra el último sorteo disponible de su juego. */
  const controles = useMemo(() => {
    const mapa = new Map<string, ControlJugada | null>();
    for (const j of jugadas) {
      const s = sorteos.find((x) => x.juegoCodigo === j.juegoCodigo);
      try {
        mapa.set(j.id, s ? controlarJugada(j, s) : null);
      } catch {
        mapa.set(j.id, null);
      }
    }
    return mapa;
  }, [jugadas, sorteos]);

  function abrir(v: Vista, h: string, e: string, p = 0) {
    setPila((prev) => [...prev, vista]);
    setVista(v);
    setTitulo({ h, e });
    setPaso(p);
    window.scrollTo(0, 0);
  }

  function volver() {
    const prev = pila.at(-1);
    if (!prev) return;
    setPila((p) => p.slice(0, -1));
    setVista(prev);
    setPaso(0);
    if (prev.t === 'raiz') setTitulo(tituloRaiz(prev.raiz));
    window.scrollTo(0, 0);
  }

  function irRaiz(r: Raiz) {
    setPila([]);
    setVista({ t: 'raiz', raiz: r });
    setTitulo(tituloRaiz(r));
    setPaso(0);
    window.scrollTo(0, 0);
  }

  function tituloRaiz(r: Raiz) {
    const activas = jugadas.filter((j) => !j.archivada).length;
    if (r === 'hoy')
      return {
        h: 'Hoy',
        e: new Date().toLocaleDateString('es-AR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
      };
    if (r === 'jugadas')
      return { h: 'Mis jugadas', e: `${activas} ${activas === 1 ? 'activa' : 'activas'}` };
    if (r === 'resultados') return { h: 'Resultados', e: 'Todos los poceados' };
    return { h: 'Ajustes', e: '' };
  }

  // Se recalcula en cada render: si no, el contador queda con el valor
  // que tenia jugadas en el momento de navegar y muestra uno de menos.
  const encabezado = vista.t === 'raiz' ? tituloRaiz(vista.raiz) : titulo;
  const enPush = vista.t !== 'raiz';

  return (
    <div className="app">
      {offline && <div className="aviso-offline">Sin conexión · mostrando lo último guardado</div>}

      <div className="top">
        {enPush && (
          <button className="back" onClick={volver} aria-label="Volver">
            ←
          </button>
        )}
        <div>
          {encabezado.e && <div className="eyebrow">{encabezado.e}</div>}
          <h2>{encabezado.h}</h2>
        </div>
      </div>

      {paso > 0 && (
        <div className="steps">
          {[1, 2, 3].map((n) => (
            <i key={n} className={n <= paso ? 'on' : ''} />
          ))}
        </div>
      )}

      <div className="view">
        {cargando ? (
          <div className="cargando">Cargando…</div>
        ) : vista.t === 'nueva' ? (
          <NuevaJugada
            juegos={juegos}
            onPaso={(p, h, e) => {
              setPaso(p);
              setTitulo({ h, e });
            }}
            onGuardada={async () => {
              setJugadas(await almacen.listarJugadas());
              setAviso('Jugada guardada. Ya queda para todos los sorteos.');
              irRaiz('jugadas');
            }}
          />
        ) : vista.t === 'detalle' ? (
          <Detalle
            jugada={jugadas.find((j) => j.id === vista.jugadaId)!}
            control={controles.get(vista.jugadaId) ?? null}
            jugadas={jugadas}
            onBorrar={async (id) => {
              await almacen.borrarJugada(id);
              setJugadas(await almacen.listarJugadas());
              setAviso('Jugada eliminada');
              irRaiz('jugadas');
            }}
          />
        ) : vista.t === 'sorteo' ? (
          <DetalleSorteo
            sorteo={sorteos.find(
              (s) => s.juegoCodigo === vista.juego && s.nroConcurso === vista.nro,
            )}
          />
        ) : vista.raiz === 'hoy' ? (
          <Hoy
            jugadas={jugadas}
            controles={controles}
            sorteos={sorteos}
            onAbrir={(j) => abrir({ t: 'detalle', jugadaId: j.id }, j.alias, 'Jugada guardada')}
            onNueva={() => abrir({ t: 'nueva' }, 'Elegí el juego', 'Paso 1 de 3', 1)}
          />
        ) : vista.raiz === 'jugadas' ? (
          <MisJugadas
            jugadas={jugadas}
            juegos={juegos}
            onAbrir={(j) => abrir({ t: 'detalle', jugadaId: j.id }, j.alias, 'Jugada guardada')}
            onNueva={() => abrir({ t: 'nueva' }, 'Elegí el juego', 'Paso 1 de 3', 1)}
          />
        ) : vista.raiz === 'resultados' ? (
          <Resultados
            sorteos={sorteos}
            juegos={juegos}
            onAbrir={(s) =>
              abrir(
                { t: 'sorteo', juego: s.juegoCodigo, nro: s.nroConcurso },
                `Concurso ${s.nroConcurso}`,
                fechaLocal(s.fecha).toLocaleDateString('es-AR'),
              )
            }
          />
        ) : (
          <Ajustes jugadas={jugadas} onAviso={setAviso} onRecargar={recargar} />
        )}
      </div>

      {!enPush && (
        <button
          className="fab"
          onClick={() => abrir({ t: 'nueva' }, 'Elegí el juego', 'Paso 1 de 3', 1)}
          aria-label="Nueva jugada"
        >
          +
        </button>
      )}

      <nav className="tabs">
        {(['hoy', 'jugadas', 'resultados', 'ajustes'] as Raiz[]).map((r) => (
          <button
            key={r}
            aria-current={vista.t === 'raiz' && vista.raiz === r ? 'page' : undefined}
            onClick={() => irRaiz(r)}
          >
            <span className="ic">{{ hoy: '◉', jugadas: '◫', resultados: '▣', ajustes: '⚙' }[r]}</span>
            {r === 'hoy' ? 'Hoy' : r === 'jugadas' ? 'Jugadas' : r === 'resultados' ? 'Resultados' : 'Ajustes'}
          </button>
        ))}
      </nav>

      {aviso && <div className="toast">{aviso}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- pantallas

function Hoy({
  jugadas,
  controles,
  sorteos,
  onAbrir,
  onNueva,
}: {
  jugadas: JugadaGuardada[];
  controles: Map<string, ControlJugada | null>;
  sorteos: Sorteo[];
  onAbrir: (j: JugadaGuardada) => void;
  onNueva: () => void;
}) {
  const activas = jugadas.filter((j) => !j.archivada);
  if (!activas.length) {
    return (
      <Vacio
        titulo="Todavía no cargaste jugadas"
        texto="Cargá tus números una vez y quedan guardados. Después de cada sorteo la app los controla sola."
        accion="Cargar mi primera jugada"
        onAccion={onNueva}
      />
    );
  }

  const controladas = activas.filter((j) => controles.get(j.id));
  const total = controladas.reduce((s, j) => s + (controles.get(j.id)?.totalACobrar ?? 0), 0);

  return (
    <div className="pad">
      {!sorteos.length && (
        <Nota tipo="aviso" titulo="Todavía no hay sorteos cargados">
          El backend está andando pero la base está vacía. Falta correr la ingesta para bajar los
          resultados.
        </Nota>
      )}

      {controladas.length > 0 && (
        <>
          <div className="sum">
            <div className="k">Cobrás</div>
            <div className="v">{pesos(total)}</div>
            <div className="n">
              Sumando {controladas.length}{' '}
              {controladas.length === 1 ? 'jugada controlada' : 'jugadas controladas'}.
            </div>
          </div>

          <Encabezado>Último control</Encabezado>
          {controladas.map((j) => (
            <Talon key={j.id} jugada={j} control={controles.get(j.id)} onClick={() => onAbrir(j)} />
          ))}
        </>
      )}

      {activas.filter((j) => !controles.get(j.id)).length > 0 && (
        <>
          <Encabezado>Sin sorteo para controlar</Encabezado>
          {activas
            .filter((j) => !controles.get(j.id))
            .map((j) => (
              <Talon key={j.id} jugada={j} onClick={() => onAbrir(j)} />
            ))}
        </>
      )}

      <p className="legal">
        Datos informativos. El extracto oficial impreso de cada lotería es el único válido para el
        cobro de premios. Jugar compulsivamente es perjudicial para la salud. Línea gratuita
        0800-333-0333.
      </p>
    </div>
  );
}

function MisJugadas({
  jugadas,
  juegos,
  onAbrir,
  onNueva,
}: {
  jugadas: JugadaGuardada[];
  juegos: Juego[];
  onAbrir: (j: JugadaGuardada) => void;
  onNueva: () => void;
}) {
  const activas = jugadas.filter((j) => !j.archivada);
  if (!activas.length) {
    return (
      <Vacio
        titulo="No hay jugadas guardadas"
        texto="Cargá tus números una vez y la app los controla después de cada sorteo."
        accion="Cargar una jugada"
        onAccion={onNueva}
      />
    );
  }
  const porJuego = juegos
    .map((g) => ({ juego: g, lista: activas.filter((j) => j.juegoCodigo === g.codigo) }))
    .filter((x) => x.lista.length);

  return (
    <div className="pad">
      {porJuego.map(({ juego, lista }) => (
        <div key={juego.codigo}>
          <Encabezado>
            {juego.nombre} — {lista.length} {lista.length === 1 ? 'jugada' : 'jugadas'}
          </Encabezado>
          {lista.map((j) => (
            <Talon key={j.id} jugada={j} onClick={() => onAbrir(j)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Detalle({
  jugada,
  control,
  onBorrar,
}: {
  jugada: JugadaGuardada;
  control: ControlJugada | null;
  jugadas: JugadaGuardada[];
  onBorrar: (id: string) => void;
}) {
  if (!jugada) return <div className="cargando">Jugada no encontrada</div>;

  return (
    <div className="pad">
      <Talon jugada={jugada} />

      {!control ? (
        <Nota tipo="aviso" titulo="Todavía no hay sorteo">
          Cuando entre el próximo concurso de {jugada.juegoCodigo.replace('_', ' ')} vas a ver acá
          el desglose de aciertos.
        </Nota>
      ) : (
        <>
          <div className="sum">
            <div className="k">{control.totalACobrar > 0 ? 'Cobrás' : 'Esta vez'}</div>
            <div className="v">
              {control.totalACobrar > 0 ? pesos(control.totalACobrar) : 'Sin premio'}
            </div>
            <div className="n">
              Concurso {control.nroConcurso} ·{' '}
              {fechaLocal(control.fecha).toLocaleDateString('es-AR')}. Tu mejor resultado fue{' '}
              {control.mejorAciertos}{' '}
              {control.mejorAciertos === 1 ? 'acierto' : 'aciertos'} en {control.mejorModalidad}.
            </div>
          </div>

          <Encabezado>Acierto por acierto</Encabezado>
          {control.modalidades.map((m) => (
            <FichaModalidad
              key={m.modalidadCodigo}
              m={m}
              numerosJugada={jugada.numeros}
              plusJugada={jugada.plus}
            />
          ))}

          <Nota tipo="info" titulo="Por qué cambian los aciertos">
            Son los mismos {jugada.numeros.length} números tuyos contra varios sorteos distintos.
            Por eso el desglose va separado y no como una sola cuenta.
          </Nota>
        </>
      )}

      <div className="btnrow">
        <button
          className="btn ghost"
          onClick={() => {
            if (confirm(`¿Eliminar la jugada "${jugada.alias}"? No se puede deshacer.`)) {
              onBorrar(jugada.id);
            }
          }}
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}

function Resultados({
  sorteos,
  juegos,
  onAbrir,
}: {
  sorteos: Sorteo[];
  juegos: Juego[];
  onAbrir: (s: Sorteo) => void;
}) {
  if (!sorteos.length) {
    return (
      <Vacio
        titulo="No hay sorteos en la base"
        texto="El backend está andando pero todavía no bajó ningún resultado. Falta armar la ingesta que lee el sitio de la lotería."
      />
    );
  }
  return (
    <div className="pad">
      <Encabezado>Últimos sorteos</Encabezado>
      {sorteos.map((s) => (
        <button
          key={`${s.juegoCodigo}-${s.nroConcurso}`}
          className="row"
          onClick={() => onAbrir(s)}
        >
          <div>
            <div className="t">
              {juegos.find((j) => j.codigo === s.juegoCodigo)?.nombre ?? s.juegoCodigo} ·{' '}
              {s.nroConcurso}
            </div>
            <div className="s">{fechaLocal(s.fecha).toLocaleDateString('es-AR')}</div>
          </div>
          <span
            className="dot"
            style={{ background: COLOR_JUEGO[s.juegoCodigo] ?? 'var(--ink)' }}
          />
        </button>
      ))}
    </div>
  );
}

function DetalleSorteo({ sorteo }: { sorteo?: Sorteo }) {
  if (!sorteo) return <div className="cargando">Sorteo no encontrado</div>;
  return (
    <div className="pad">
      {sorteo.resultados.map((r) => (
        <div key={r.modalidadCodigo} className="ext">
          <h4>{r.modalidadCodigo.replace(/_/g, ' ')}</h4>
          <div className="nums">
            <Bolas numeros={r.numeros} />
          </div>
          <table>
            <tbody>
              {r.escalones.map((e) => (
                <tr key={e.aciertos}>
                  <td className="a">{e.aciertos} aciertos</td>
                  <td>
                    {e.vacante
                      ? 'vacante'
                      : `${e.ganadores.toLocaleString('es-AR')} · ${pesos(e.premioUnitario)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Ajustes({
  jugadas,
  onAviso,
  onRecargar,
}: {
  jugadas: JugadaGuardada[];
  onAviso: (s: string) => void;
  onRecargar: () => void;
}) {
  async function exportar() {
    const txt = await almacen.exportar();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    a.download = `poceados-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    onAviso(`Exportadas ${jugadas.length} jugadas`);
  }

  function importar() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const n = await almacen.importar(await f.text());
        onAviso(`Importadas ${n} jugadas`);
        onRecargar();
      } catch (e) {
        onAviso((e as Error).message);
      }
    };
    inp.click();
  }

  const tokenIngesta = import.meta.env.VITE_INGESTA_TOKEN;
  const apiIngesta = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
  const [htmlPegado, setHtmlPegado] = useState('');
  const [guardandoQuini, setGuardandoQuini] = useState(false);

  async function copiarBookmarklet() {
    // El bookmarklet solo copia la página al portapapeles. No manda nada
    // por su cuenta: eso se hace pegando acá abajo y tocando "Guardar",
    // para que quede claro qué está pasando en cada paso.
    const codigo =
      `(function(){var h=document.documentElement.outerHTML;` +
      `function ok(){alert('Copiado. Volvé a la app de Poceados, pegalo en Ajustes y tocá Guardar.')}` +
      `function viejo(){var ta=document.createElement('textarea');ta.value=h;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);ok()}` +
      `if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(h).then(ok).catch(viejo)}else{viejo()}` +
      `})();`;
    const bookmarklet = `javascript:${encodeURIComponent(codigo)}`;
    try {
      await navigator.clipboard.writeText(bookmarklet);
      onAviso('Copiado. Pegalo como dirección de un favorito nuevo.');
    } catch {
      onAviso('No se pudo copiar. Probá desde el navegador del celular.');
    }
  }

  async function guardarPegado() {
    if (!htmlPegado.trim()) {
      onAviso('Pegá el contenido de la página primero');
      return;
    }
    setGuardandoQuini(true);
    try {
      const r = await fetch(`${apiIngesta}/ingesta/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ingesta-token': tokenIngesta ?? '' },
        body: JSON.stringify({ juegoCodigo: 'QUINI6', html: htmlPegado }),
      });
      const d = await r.json();
      if (r.ok) {
        onAviso(`Listo: concurso ${d.nroConcurso} (${d.fecha}) guardado.`);
        setHtmlPegado('');
        onRecargar();
      } else {
        onAviso(`Error: ${d.error ?? r.status}`);
      }
    } catch (e) {
      onAviso(`Error de red: ${(e as Error).message}`);
    } finally {
      setGuardandoQuini(false);
    }
  }

  return (
    <div className="pad">
      <Encabezado>Mis datos</Encabezado>
      <Nota tipo="info" titulo="Todo se guarda en este dispositivo">
        Las jugadas viven en el navegador. No hay cuenta ni servidor. Si limpiás los datos del
        navegador o cambiás de equipo, se pierden. Por eso conviene exportar de vez en cuando.
      </Nota>

      <button className="row" onClick={exportar}>
        <div>
          <div className="t">Exportar jugadas</div>
          <div className="s">Descarga un archivo de respaldo</div>
        </div>
        <span className="chev">›</span>
      </button>
      <button className="row" onClick={importar}>
        <div>
          <div className="t">Importar jugadas</div>
          <div className="s">Restaurar desde un respaldo</div>
        </div>
        <span className="chev">›</span>
      </button>

      {tokenIngesta && (
        <>
          <Encabezado>Actualizar Quini 6 a mano</Encabezado>
          <Nota tipo="aviso" titulo="Por qué existe esto">
            Lotería Santa Fe bloquea las conexiones desde nuestro servidor, así que a veces Quini 6
            no se actualiza solo. Desde tu celular sí se puede leer la página sin problema. Son dos
            pasos: 1) copiar la página con un accesito, 2) volver acá y pegarla.
          </Nota>

          <Nota tipo="info" titulo="Paso 1 (una sola vez): instalar el accesito">
            Tocá "Copiar accesito" acá abajo. Después agregá cualquier página a favoritos de tu
            navegador y editá ese favorito, reemplazando su dirección por lo que copiaste. En
            Chrome (Android): favoritos → tres puntos del favorito → Editar → pegar en "URL". En
            Safari (iPhone): favoritos → Editar → tocar el favorito → pegar en la dirección.
          </Nota>

          <button className="row" onClick={copiarBookmarklet}>
            <div>
              <div className="t">Copiar accesito</div>
              <div className="s">Para instalarlo en tus favoritos</div>
            </div>
            <span className="chev">›</span>
          </button>

          <Nota tipo="info" titulo="Paso 2: cada vez que quieras actualizar">
            Abrí la página de resultados de Quini 6 en tu navegador (no en esta app) y tocá el
            accesito de tus favoritos — copia la página, no manda nada todavía. Volvé acá, pegala
            en el cuadro de abajo y tocá "Guardar".
          </Nota>

          <textarea
            className="pegar"
            placeholder="Pegá acá lo que copiaste con el accesito"
            value={htmlPegado}
            onChange={(e) => setHtmlPegado(e.target.value)}
          />
          <div className="btnrow">
            <button className="btn" onClick={guardarPegado} disabled={guardandoQuini}>
              {guardandoQuini ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </>
      )}

      <Encabezado>Juego responsable</Encabezado>
      <button
        className="row"
        onClick={() => onAviso('Línea gratuita de atención: 0800-333-0333, las 24 horas')}
      >
        <div>
          <div className="t">Línea de ayuda 0800-333-0333</div>
          <div className="s">Atención gratuita las 24 horas</div>
        </div>
        <span className="chev">›</span>
      </button>

      <p className="legal">
        Aplicación no oficial. Los datos son informativos y pueden contener errores. El extracto
        oficial impreso de cada lotería es el único documento válido para el cobro de premios.
      </p>
    </div>
  );
}
