/**
 * Ingesta manual: baja el último sorteo de cada juego y lo guarda.
 *
 * Correr con: npm run ingesta
 */

import { PrismaClient } from '@prisma/client';
import { ingestarJuego } from './ingestar.ts';

const prisma = new PrismaClient();

for (const juego of ['QUINI6', 'LOTO_PLUS']) {
  try {
    await ingestarJuego(prisma, juego);
  } catch (e) {
    console.error(`  falló ${juego}: ${(e as Error).message}`);
  }
}

await prisma.$disconnect();
console.log('\nlisto\n');
