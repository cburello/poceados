# Control de Poceados

App para controlar jugadas de lotería argentina. Guardás tus números una vez y
después de cada sorteo la app te dice qué acertaste y cuánto cobrás.

Backend Node 22 + TypeScript + Fastify + Prisma. Frontend React + Vite (PWA).

---

## Arrancar

```
npm install
npx prisma migrate dev --name inicial
npm test          # 28 tests, sin red ni base
npm run dev       # backend en :3000
npm run ingesta   # baja los resultados y llena la base
```

En otra terminal:

```
cd web
npm install
npm run dev       # app en :5173
```

---

## Variables de entorno

**Backend** (`.env` local / Variables en Railway):
- `DATABASE_URL`, `DIRECT_URL` — Postgres en Supabase (pooler y directa).
- `INGESTA_TOKEN` — protege `POST /ingesta/foto` y `POST /ingesta/confirmar`.
- `ANTHROPIC_API_KEY` — para que `leerCaptura.ts` pueda llamar a Claude.

**Frontend** (Environment Variables en Vercel, prefijo `VITE_` obligatorio):
- `VITE_API_URL` — URL del backend en Railway.
- `VITE_INGESTA_TOKEN` — mismo valor que `INGESTA_TOKEN`. Sin esta variable, la
  seccion de Ajustes para subir capturas de Quini 6 no aparece.

En Railway y Vercel, guardar una variable **no alcanza**: hay que aplicar el deploy
pendiente (en Railway, el boton "Deploy" que aparece arriba a la izquierda con los
cambios en cola).

---

## Estado actual

| Juego | Config | Ingesta | Fuente |
|---|---|---|---|
| Quini 6 | verificada | funciona | loteriasantafe.gov.ar |
| Loto Plus | verificada | funciona | loto.loteriadelaciudad.gob.ar |
| Brinco | sin verificar | cableada, sin probar | Santa Fe |
| Telekino | sin verificar | falta | otro organismo |
| Loto 5 Plus | falta en catalogo | falta | loto5.loteriadelaciudad.gob.ar |
| Poceada Federal | falta en catalogo | falta | Santa Fe |

Los dos juegos que andan quedan en estado `PARCIAL`: hay una sola fuente por juego
y la conciliacion exige dos para declarar `CONFIRMADO`.

---

## Decisiones de diseno (no deshacer sin entender por que)

**Los juegos son configuracion, no codigo.** `src/config/juegos.ts` declara rango,
cantidad de numeros, dias de sorteo y modalidades. Cada modalidad tiene un `tipo`
(`ESCALONADA`, `MAS_ACIERTOS`, `DERIVADA`) y el motor sabe que hacer con cada uno.
Si para agregar un juego hay que tocar el motor, falta un tipo.

**El control es una funcion pura.** `src/dominio/control.ts` no toca base ni red.
El frontend lo importa via el alias `@dominio` de `vite.config.ts`, que apunta a
`../src`. Una sola implementacion para servidor y navegador: no hay dos versiones
que se desincronicen, y la PWA controla sin conexion.

**Nada se publica con una sola fuente.** `src/ingesta/conciliar.ts` compara **solo
los numeros**, no los montos: los montos se completan durante la noche y compararlos
daria falsas discrepancias. Si dos fuentes no coinciden, el sorteo queda en
`DISCREPANCIA` y la API responde 409 en vez de un resultado posiblemente falso.

**Cuatro estados de premio**, no dos:
- `GANADOR` con el monto
- `SIN_PREMIO` con el motivo
- `PENDIENTE_EXTRACTO` cuando todavia no se puede saber
- `NO_JUGADA` cuando el usuario no pago esa modalidad

El tercero existe por Siempre Sale (Quini 6) y Sale o Sale (Loto Plus): ahi el pozo
va a quien tenga **mas** aciertos del pais, no a un umbral fijo. Con 5 aciertos
cobras solo si nadie hizo 6. Sin el dato del extracto no hay forma de resolverlo, y
adivinar es peor que esperar.

**El "mejor resultado" excluye las modalidades DERIVADA.** El Premio Extra de Quini 6
se juega contra 15 bolillas en vez de 6, asi que 5 aciertos ahi no valen lo mismo que
5 en Tradicional. Un test cubre esto: fue un bug real.

**Diferencia clave entre los dos juegos:** en Quini 6, Revancha y Siempre Sale se
pagan aparte (`opcional: true`). En Loto Plus las cuatro modalidades vienen en el
mismo ticket (`opcional: false`). Fue un error de configuracion que se corrigio
leyendo el sitio oficial de LOTBA.

**Las jugadas viven en IndexedDB del navegador**, no en el servidor. No hay cuentas.
Por eso exportar/importar en Ajustes no es un extra: es la unica red de seguridad, y
la unica forma de pasar jugadas entre dispositivos.

---

## Las fuentes, y por que fueron dificiles

**Quini 6 (`src/proveedores/santafe.ts`).** La pagina publica
`loteriasantafe.gov.ar/index.php/resultados/quini-6` **no tiene los resultados**: es
una cascara con un iframe que JavaScript llena apuntando a otro servidor. El HTML de
verdad esta en `apps.loteriasantafe.gov.ar:8443`. Ademas, el extracto **no trae ninguna
fecha completa**: hay que armarla juntando el select de mes ("Agosto 2026") con el de
sorteo ("Miercoles 12 - 3399"). Las columnas de la tabla de premios se leen **por nombre
de encabezado**, no por posicion, porque Siempre Sale tiene una columna extra "Aciertos".

**Loto Plus (`src/proveedores/lotba.ts`).** Mucho mas limpio: el endpoint
`loto.loteriadelaciudad.gob.ar/includes/resultados-data.php?sorteo=NNNN` devuelve un
archivo JS con `window.PREMIOS_DATA = [...]` ya estructurado. Hay que recortar el
envoltorio antes de parsear. En Sale o Sale LOTBA publica **solo el nivel ganador**,
que es justo el dato que en Quini 6 hay que deducir.

**Los fixtures de `src/proveedores/fixtures/` son HTML y JS reales capturados de los
sitios.** Los tests corren contra esos archivos, sin red. Si un sitio cambia el
maquetado, los tests fallan y nos enteramos ahi, no con datos mal cargados en la base.
Al agregar una fuente nueva, capturar el fixture primero.

---

## Loteria Santa Fe bloquea las conexiones desde la nube

`apps.loteriasantafe.gov.ar:8443` no responde si el pedido sale desde un datacenter:
se probo desde Railway (regiones EU West y US East) y desde los runners de GitHub
Actions, y las tres veces `ConnectTimeoutError` / `fetch failed`, tanto en el puerto
8443 como en el 443 del mismo host. No es un problema de puerto ni de codigo: el sitio
filtra por origen de la conexion. Desde una red residencial (notebook, celular) siempre
respondio bien.

**Loto Plus sigue andando solo** porque LOTBA (`loto.loteriadelaciudad.gob.ar`) no tiene
ese bloqueo.

**Para Quini 6, la salida fue mover la ingesta al celular.** En Ajustes hay un boton para
subir una captura de pantalla de la pagina de resultados. El backend (`src/ingesta/leerCaptura.ts`)
se la manda a Claude (Haiku, barato, alcanza de sobra para leer una tabla de numeros) con
instrucciones para devolver el mismo formato `SorteoCrudo` que usan los demas proveedores.
**No se guarda nada solo:** `POST /ingesta/foto` devuelve la lectura para que el usuario la
revise contra la captura, y recien `POST /ingesta/confirmar` la guarda — mismo criterio que
`conciliar.ts` de no publicar un resultado sin confirmar. Los dos endpoints piden el header
`x-ingesta-token` (variable `INGESTA_TOKEN`) para que no cualquiera pueda mandar datos falsos.

Se probaron y descartaron dos alternativas antes de llegar a esta:
- Un *bookmarklet* que copiaba el HTML de la pagina y lo pegaba en la app (`POST /ingesta/relay`,
  ya no existe): funcionaba, pero instalarlo y usarlo resulto demasiado confuso.
- Un workflow de GitHub Actions con el mismo cron que Railway: mismo bloqueo, se borro.

---

## Proximos pasos, en orden

1. ~~**Migrar SQLite a Postgres (Supabase).**~~ Hecho. `numeros Int[]` nativo,
   se fueron los `JSON.parse`/`JSON.stringify` del servidor y la ingesta.
2. ~~**Desplegar el backend.**~~ Hecho, en Railway: https://poceados-production.up.railway.app
   Repo conectado a GitHub (`cburello/poceados`), deploy automatico en cada push a `master`.
   Scheduler con `node-cron` activo (`src/ingesta/programador.ts`, hora Argentina):
   Quini 6 miercoles y domingos 21:55, Loto Plus miercoles y sabados 22:40 (sorteo + 40 min),
   con 4 reintentos cada 15 min si el sitio todavia no publico.
3. ~~**Desplegar el frontend.**~~ Hecho, en Vercel: https://poceados.vercel.app
   Root Directory `web`, `VITE_API_URL` apuntando al backend de Railway (`api.ts`
   usa esa variable en produccion y el proxy `/api` solo en desarrollo).
4. **Segundo proveedor para conciliar.** El mas facil: el XML que LOTBA publica junto
   al PDF, en `archivos.xml` del mismo endpoint. Con eso Loto Plus llega a `CONFIRMADO`.
5. ~~**Boton "actualizar resultados" en Ajustes.**~~ Hecho, pero no como se penso originalmente:
   Railway no puede llegar a Santa Fe (ver seccion de arriba), asi que el boton sube una
   captura de pantalla en vez de forzar un fetch del lado del servidor.
6. Juegos que faltan: Brinco y Poceada Federal salen del mismo servidor de Santa Fe;
   Loto 5 Plus tiene su propio subdominio en LOTBA, probablemente con el mismo endpoint.

---

## Aviso

Aplicacion no oficial. Los datos son informativos y pueden contener errores. El extracto
oficial impreso de cada loteria es el unico documento valido para el cobro de premios.
Jugar compulsivamente es perjudicial para la salud. Linea gratuita 0800-333-0333.
