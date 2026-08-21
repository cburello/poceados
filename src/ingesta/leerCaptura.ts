/**
 * Lee una captura de pantalla del extracto de Quini 6 con Claude (Haiku) y
 * devuelve la misma forma de datos que el resto de los proveedores.
 *
 * Existe porque Lotería Santa Fe bloquea las conexiones salientes desde
 * Railway. La captura la toma el usuario en su celular (nunca bloqueado,
 * es tráfico normal) y esto la interpreta del lado del servidor. El
 * resultado NO se guarda acá: el llamador lo muestra para confirmar antes.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SorteoCrudo } from '../proveedores/tipos.ts';

const MODELO = 'claude-haiku-4-5';

const INSTRUCCIONES = `Esta es una captura de pantalla del extracto de Quini 6 de Lotería de Santa Fe (Argentina).

Devolvé ÚNICAMENTE un objeto JSON (sin texto alrededor, sin markdown) con esta forma exacta:

{
  "nroConcurso": <número de concurso, entero>,
  "fecha": "<fecha en formato YYYY-MM-DD>",
  "resultados": [
    {
      "modalidadCodigo": "TRADICIONAL" | "SEGUNDA" | "REVANCHA" | "SIEMPRE_SALE",
      "numeros": [<6 números enteros>],
      "nivelGanador": <entero o null, solo relevante en SIEMPRE_SALE: el máximo de aciertos con el que salió premiado alguien>,
      "escalones": [
        {
          "etiqueta": "<texto tal cual aparece, ej '1° Premio', 'Estímulo'>",
          "aciertos": <entero o null>,
          "pozo": <número, sin puntos de miles ni comas>,
          "ganadores": <entero, 0 si dice VACANTE>,
          "premioUnitario": <número, 0 si vacante>,
          "vacante": <true o false>
        }
      ]
    }
  ]
}

Reglas:
- Incluí una entrada en "resultados" por cada modalidad que se vea en la imagen (Tradicional Primer Sorteo -> TRADICIONAL, La Segunda del Quini -> SEGUNDA, Revancha -> REVANCHA, Siempre Sale -> SIEMPRE_SALE). No incluyas "Premio Extra".
- Los montos en pesos argentinos usan punto para miles y coma para decimales (ej "1.100.000.000,00" es 1100000000). Convertilos a número plano.
- Si un campo no se puede leer con confianza, usá null en vez de inventar un valor.
- No agregues comentarios ni explicaciones, solo el JSON.`;

export async function leerCapturaQuini6(
  imagenBase64: string,
  mediaType: string,
): Promise<SorteoCrudo> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Falta configurar ANTHROPIC_API_KEY');

  const client = new Anthropic({ apiKey });

  const respuesta = await client.messages.create({
    model: MODELO,
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType as any, data: imagenBase64 },
          },
          { type: 'text', text: INSTRUCCIONES },
        ],
      },
    ],
  });

  const bloque = respuesta.content.find((b) => b.type === 'text');
  if (!bloque || bloque.type !== 'text') {
    throw new Error('La IA no devolvió texto');
  }

  const json = bloque.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');

  let datos: any;
  try {
    datos = JSON.parse(json);
  } catch {
    throw new Error('No se pudo interpretar la respuesta de la IA como JSON');
  }

  if (!datos.nroConcurso || !datos.fecha || !Array.isArray(datos.resultados)) {
    throw new Error('La lectura de la captura vino incompleta, probá con otra foto');
  }

  return {
    juegoCodigo: 'QUINI6',
    nroConcurso: datos.nroConcurso,
    fecha: datos.fecha,
    resultados: datos.resultados,
  };
}
