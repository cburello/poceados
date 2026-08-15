/**
 * Cliente del backend.
 *
 * Todo lo que baja se cachea en IndexedDB, así la app sigue controlando
 * jugadas aunque el servidor esté apagado o no haya conexión.
 */

import type { Sorteo } from '@dominio/dominio/control.ts';
import type { Juego } from '@dominio/config/juegos.ts';
import { almacen } from './almacen.ts';

// En dev, '/api' pasa por el proxy de vite.config.ts. En producción no hay
// proxy: hace falta la URL completa del backend desplegado.
const API = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');

async function traer<T>(ruta: string, claveCache: string): Promise<{ dato: T; deCache: boolean }> {
  try {
    const r = await fetch(`${API}${ruta}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`${r.status}`);
    const dato = (await r.json()) as T;
    await almacen.guardarCache(claveCache, dato);
    return { dato, deCache: false };
  } catch {
    const guardado = await almacen.leerCache<T>(claveCache);
    if (guardado === undefined) {
      throw new Error('No hay conexión con el servidor ni datos guardados');
    }
    return { dato: guardado, deCache: true };
  }
}

export const api = {
  async juegos() {
    const { dato, deCache } = await traer<{ juegos: Juego[] }>('/juegos', 'juegos');
    return { juegos: dato.juegos, deCache };
  },

  async sorteos(limite = 20) {
    const { dato, deCache } = await traer<{ sorteos: Sorteo[] }>(
      `/sorteos?limite=${limite}`,
      'sorteos',
    );
    return { sorteos: dato.sorteos, deCache };
  },

  /** Último sorteo de un juego, del cache si no hay red. */
  async ultimoSorteo(juegoCodigo: string): Promise<Sorteo | null> {
    const { sorteos } = await this.sorteos(50);
    return sorteos.find((s) => s.juegoCodigo === juegoCodigo) ?? null;
  },
};
