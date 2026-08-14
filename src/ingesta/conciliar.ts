/**
 * Conciliación entre fuentes.
 *
 * Regla: un sorteo no se publica con una sola fuente. Si dos coinciden en los
 * números, queda CONFIRMADO. Si se contradicen, queda DISCREPANCIA y la app
 * muestra el aviso en vez de un resultado posiblemente falso.
 *
 * Es preferible que el usuario espere media hora a que tire un ticket ganador
 * porque le dijimos que no acertó.
 */

import { huellaDe, type Proveedor, type SorteoCrudo } from '../proveedores/tipos.ts';

export type EstadoSorteo = 'PENDIENTE' | 'PARCIAL' | 'CONFIRMADO' | 'DISCREPANCIA';

export interface Conciliacion {
  estado: EstadoSorteo;
  sorteo: SorteoCrudo | null;
  lecturas: { fuente: string; ok: boolean; huella?: string; error?: string }[];
  detalle: string;
}

export async function conciliar(
  juegoCodigo: string,
  nro: number,
  proveedores: Proveedor[],
): Promise<Conciliacion> {
  const aptos = proveedores.filter((p) => p.juegos.includes(juegoCodigo));
  const lecturas: Conciliacion['lecturas'] = [];
  const exitosas: { p: Proveedor; s: SorteoCrudo; huella: string }[] = [];

  await Promise.all(
    aptos.map(async (p) => {
      try {
        const s = await p.traerConcurso(juegoCodigo, nro);
        const h = huellaDe(s);
        exitosas.push({ p, s, huella: h });
        lecturas.push({ fuente: p.codigo, ok: true, huella: h });
      } catch (e) {
        lecturas.push({ fuente: p.codigo, ok: false, error: (e as Error).message });
      }
    }),
  );

  if (exitosas.length === 0) {
    return {
      estado: 'PENDIENTE',
      sorteo: null,
      lecturas,
      detalle: 'Ninguna fuente respondió. Se reintenta en el próximo ciclo.',
    };
  }

  if (exitosas.length === 1) {
    return {
      estado: 'PARCIAL',
      sorteo: exitosas[0].s,
      lecturas,
      detalle: `Sólo respondió ${exitosas[0].p.codigo}. Falta una segunda fuente para confirmar.`,
    };
  }

  const huellas = new Set(exitosas.map((x) => x.huella));
  if (huellas.size > 1) {
    return {
      estado: 'DISCREPANCIA',
      sorteo: null,
      lecturas,
      detalle:
        `Las fuentes no coinciden en los números del concurso ${nro}. ` +
        `No se publica hasta verificar contra el extracto oficial.`,
    };
  }

  // Coinciden. Nos quedamos con la fuente que traiga más escalones cargados,
  // porque los montos suelen completarse a distinto ritmo.
  const mejor = exitosas.reduce((a, b) =>
    b.s.resultados.reduce((n, r) => n + r.escalones.length, 0) >
    a.s.resultados.reduce((n, r) => n + r.escalones.length, 0)
      ? b
      : a,
  );

  return {
    estado: 'CONFIRMADO',
    sorteo: mejor.s,
    lecturas,
    detalle: `${exitosas.length} fuentes coinciden.`,
  };
}
