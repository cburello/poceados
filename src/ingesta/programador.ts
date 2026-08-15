/**
 * Ingesta automática post-sorteo.
 *
 * Quini 6 sortea miércoles y domingos 21:15; Loto Plus miércoles y sábados
 * 22:00. Arrancamos 40 minutos después porque el sitio tarda en publicar, y
 * reintentamos cada 15 minutos por si todavía no está.
 */

import cron from 'node-cron';
import type { PrismaClient } from '@prisma/client';
import { ingestarJuego } from './ingestar.ts';

const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';
const REINTENTOS = 4;
const ESPERA_ENTRE_REINTENTOS_MS = 15 * 60 * 1000;

async function ingestarConReintentos(prisma: PrismaClient, juegoCodigo: string) {
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try {
      await ingestarJuego(prisma, juegoCodigo);
      return;
    } catch (e) {
      console.error(
        `[programador] ${juegoCodigo} intento ${intento}/${REINTENTOS} falló: ${(e as Error).message}`,
      );
      if (intento < REINTENTOS) {
        await new Promise((resolver) => setTimeout(resolver, ESPERA_ENTRE_REINTENTOS_MS));
      }
    }
  }
  console.error(`[programador] ${juegoCodigo}: se agotaron los reintentos, queda para la próxima corrida`);
}

export function iniciarProgramador(prisma: PrismaClient) {
  cron.schedule(
    '55 21 * * 3,0',
    () => void ingestarConReintentos(prisma, 'QUINI6'),
    { timezone: ZONA_HORARIA },
  );
  cron.schedule(
    '40 22 * * 3,6',
    () => void ingestarConReintentos(prisma, 'LOTO_PLUS'),
    { timezone: ZONA_HORARIA },
  );
  console.log('[programador] activo: Quini 6 mié/dom 21:55, Loto Plus mié/sáb 22:40 (hora Argentina)');
}
