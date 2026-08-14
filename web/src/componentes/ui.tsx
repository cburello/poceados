import type { ControlJugada, ControlModalidad } from '@dominio/dominio/control.ts';
import type { JugadaGuardada } from '../datos/almacen.ts';

export const COLOR_JUEGO: Record<string, string> = {
  QUINI6: 'var(--quini)',
  LOTO_PLUS: 'var(--loto)',
  BRINCO: 'var(--brinco)',
  LOTO5_PLUS: 'var(--loto5)',
  POCEADA_FEDERAL: 'var(--poceada)',
  TELEKINO: 'var(--tele)',
};

export const pesos = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });

const dosDigitos = (n: number) => String(n).padStart(2, '0');

export function Bola({
  n,
  estado = 'neutra',
  chica = false,
}: {
  n: number;
  estado?: 'neutra' | 'acierto' | 'fallo';
  chica?: boolean;
}) {
  const clase =
    'ball' +
    (estado === 'acierto' ? ' hit' : estado === 'fallo' ? ' miss' : '') +
    (chica ? ' sm' : '');
  return <span className={clase}>{dosDigitos(n)}</span>;
}

export function Bolas({
  numeros,
  acertados,
  chicas,
}: {
  numeros: number[];
  acertados?: number[];
  chicas?: boolean;
}) {
  return (
    <div className="balls">
      {numeros.map((n) => (
        <Bola
          key={n}
          n={n}
          chica={chicas ?? numeros.length > 8}
          estado={
            acertados === undefined ? 'neutra' : acertados.includes(n) ? 'acierto' : 'fallo'
          }
        />
      ))}
    </div>
  );
}

export function Encabezado({ children }: { children: React.ReactNode }) {
  return (
    <div className="rulehead">
      <span>{children}</span>
    </div>
  );
}

/** Talón de la jugada. Es la unidad visual de toda la app. */
export function Talon({
  jugada,
  control,
  onClick,
}: {
  jugada: JugadaGuardada;
  control?: ControlJugada | null;
  onClick?: () => void;
}) {
  const mejor = control?.modalidades.find(
    (m) => m.modalidadNombre === control.mejorModalidad,
  );
  const gana = (control?.totalACobrar ?? 0) > 0;

  return (
    <button
      className="stub"
      style={{ ['--g' as string]: COLOR_JUEGO[jugada.juegoCodigo] ?? 'var(--ink)' }}
      onClick={onClick}
      disabled={!onClick}
    >
      {control &&
        (gana ? (
          <div className="stamp win">Cobrás</div>
        ) : control.tienePendientes ? (
          <div className="stamp pend">Pendiente</div>
        ) : null)}

      <div className="row1">
        <div className="alias">{jugada.alias}</div>
        <div className="gname">{jugada.juegoCodigo.replace('_', ' ')}</div>
      </div>

      <Bolas numeros={jugada.numeros} acertados={mejor?.acertados} />

      <div className="meta">
        <span>
          {control
            ? `${control.mejorAciertos} ${control.mejorAciertos === 1 ? 'acierto' : 'aciertos'} en ${control.mejorModalidad}`
            : `Guardada ${new Date(jugada.creadaEn).toLocaleDateString('es-AR')}`}
        </span>
        {control ? (
          gana ? (
            <span className="tag win">{pesos(control.totalACobrar)}</span>
          ) : (
            <span className="tag no">Sin premio</span>
          )
        ) : (
          <span className="tag no">Activa</span>
        )}
      </div>
    </button>
  );
}

/** Desglose de una modalidad: qué acertaste y cuánto. */
export function FichaModalidad({
  m,
  numerosJugada,
}: {
  m: ControlModalidad;
  numerosJugada: number[];
}) {
  const etiquetaAciertos =
    m.estado === 'NO_JUGADA'
      ? 'no jugada'
      : m.tipo === 'DERIVADA'
        ? `${m.aciertos} de ${numerosJugada.length}`
        : `${m.aciertos} ${m.aciertos === 1 ? 'acierto' : 'aciertos'}`;

  return (
    <div className={'ext' + (m.estado === 'NO_JUGADA' ? ' off' : '')}>
      <h4>
        {m.modalidadNombre}
        <span className={'ac' + (m.estado === 'GANADOR' ? ' good' : '')}>
          {etiquetaAciertos}
        </span>
      </h4>

      {m.estado !== 'NO_JUGADA' && (
        <>
          <div className="nums">
            <Bolas numeros={numerosJugada} acertados={m.acertados} chicas={false} />
          </div>
          <table>
            <tbody>
              <tr>
                <td className="a">Salieron</td>
                <td>{m.numerosSorteo.map(dosDigitos).join(' ')}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <div className="res">
        <span className="why">{m.motivo}</span>
        {m.estado === 'GANADOR' ? (
          <span className="amt">{pesos(m.premioUnitario)}</span>
        ) : m.estado === 'PENDIENTE_EXTRACTO' ? (
          <span className="tag pend">Pendiente</span>
        ) : m.estado === 'SIN_PREMIO' ? (
          <span className="tag no">Sin premio</span>
        ) : null}
      </div>
    </div>
  );
}

export function Nota({
  tipo = 'aviso',
  titulo,
  children,
}: {
  tipo?: 'aviso' | 'info' | 'alarma';
  titulo: string;
  children: React.ReactNode;
}) {
  const clase = tipo === 'info' ? 'notice info' : tipo === 'alarma' ? 'notice alarm' : 'notice';
  return (
    <div className={clase}>
      <b>{titulo}</b>
      <p>{children}</p>
    </div>
  );
}

export function Vacio({
  titulo,
  texto,
  accion,
  onAccion,
}: {
  titulo: string;
  texto: string;
  accion?: string;
  onAccion?: () => void;
}) {
  return (
    <div className="empty">
      <div className="ic">◎</div>
      <h3>{titulo}</h3>
      <p>{texto}</p>
      {accion && (
        <button className="btn" onClick={onAccion}>
          {accion}
        </button>
      )}
    </div>
  );
}
