/**
 * Persistencia local en IndexedDB.
 *
 * Las jugadas viven en el navegador. No hay cuenta ni servidor de usuarios.
 * A cambio, si el usuario limpia los datos del navegador las pierde, y por eso
 * el exportar/importar de Ajustes no es un extra: es la red de seguridad.
 */

import type { Jugada } from '@dominio/dominio/control.ts';

const BASE = 'poceados';
const VERSION = 1;
const JUGADAS = 'jugadas';
const CACHE = 'cache';

export interface JugadaGuardada extends Jugada {
  creadaEn: string;
  archivada: boolean;
  /** Cuánto sale el cupón por sorteo, para el balance. */
  costoPorSorteo: number;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const req = indexedDB.open(BASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(JUGADAS)) {
        db.createObjectStore(JUGADAS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CACHE)) {
        db.createObjectStore(CACHE);
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error ?? new Error('No se pudo abrir la base local'));
  });
}

async function conStore<T>(
  nombre: string,
  modo: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await abrir();
  return new Promise<T>((ok, mal) => {
    const tx = db.transaction(nombre, modo);
    const req = fn(tx.objectStore(nombre));
    req.onsuccess = () => ok(req.result as T);
    req.onerror = () => mal(req.error);
    tx.oncomplete = () => db.close();
  });
}

export const almacen = {
  async listarJugadas(): Promise<JugadaGuardada[]> {
    const todas = await conStore<JugadaGuardada[]>(JUGADAS, 'readonly', (s) => s.getAll());
    return todas.sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
  },

  async guardarJugada(j: JugadaGuardada): Promise<void> {
    await conStore(JUGADAS, 'readwrite', (s) => s.put(j));
  },

  async borrarJugada(id: string): Promise<void> {
    await conStore(JUGADAS, 'readwrite', (s) => s.delete(id));
  },

  /** Guarda los sorteos bajados para poder controlar sin conexión. */
  async guardarCache(clave: string, valor: unknown): Promise<void> {
    await conStore(CACHE, 'readwrite', (s) => s.put(valor, clave));
  },

  async leerCache<T>(clave: string): Promise<T | undefined> {
    return conStore<T | undefined>(CACHE, 'readonly', (s) => s.get(clave));
  },

  async exportar(): Promise<string> {
    const jugadas = await this.listarJugadas();
    return JSON.stringify(
      { version: 1, exportadoEn: new Date().toISOString(), jugadas },
      null,
      2,
    );
  },

  /** Devuelve cuántas importó. Lanza si el archivo no tiene la forma esperada. */
  async importar(texto: string): Promise<number> {
    const data = JSON.parse(texto);
    if (!Array.isArray(data?.jugadas)) {
      throw new Error('El archivo no parece un respaldo de Poceados');
    }
    for (const j of data.jugadas as JugadaGuardada[]) {
      if (!j.id || !j.juegoCodigo || !Array.isArray(j.numeros)) {
        throw new Error('El respaldo tiene jugadas incompletas');
      }
      await this.guardarJugada(j);
    }
    return data.jugadas.length;
  },
};

export function nuevoId(): string {
  return `j_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
