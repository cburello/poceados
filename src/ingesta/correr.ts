/**
 * Ingesta manual: baja el último sorteo de cada juego y lo guarda.
 *
 * Correr con: npm run ingesta
 * O para un solo juego: npm run ingesta QUINI6
 */

import { PrismaClient } from '@prisma/client';
import { ingestarJuego } from './ingestar.ts';

const prisma = new PrismaClient();
const juegos = process.argv.slice(2).length
  ? process.argv.slice(2).map((j) => j.toUpperCase())
  : ['QUINI6', 'LOTO_PLUS'];

let huboError = false;

for (const juego of juegos) {
  try {
    await ingestarJuego(prisma, juego);
  } catch (e) {
    huboError = true;
    console.error(`  falló ${juego}: ${(e as Error).message}`);
  }
}

await prisma.$disconnect();
console.log('\nlisto\n');

if (huboError) process.exitCode = 1;
