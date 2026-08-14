-- CreateTable
CREATE TABLE "Sorteo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "juegoCodigo" TEXT NOT NULL,
    "nroConcurso" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "verificadoEn" DATETIME,
    "urlExtracto" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEn" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ResultadoModalidad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sorteoId" TEXT NOT NULL,
    "modalidadCodigo" TEXT NOT NULL,
    "numerosJson" TEXT NOT NULL,
    "plus" INTEGER,
    "nivelGanador" INTEGER,
    CONSTRAINT "ResultadoModalidad_sorteoId_fkey" FOREIGN KEY ("sorteoId") REFERENCES "Sorteo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Escalon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resultadoId" TEXT NOT NULL,
    "aciertos" INTEGER,
    "etiqueta" TEXT NOT NULL,
    "pozo" REAL NOT NULL,
    "ganadores" INTEGER NOT NULL,
    "premioUnitario" REAL NOT NULL,
    "vacante" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Escalon_resultadoId_fkey" FOREIGN KEY ("resultadoId") REFERENCES "ResultadoModalidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LecturaFuente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sorteoId" TEXT,
    "juegoCodigo" TEXT NOT NULL,
    "nroConcurso" INTEGER NOT NULL,
    "fuente" TEXT NOT NULL,
    "huella" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "leidoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LecturaFuente_sorteoId_fkey" FOREIGN KEY ("sorteoId") REFERENCES "Sorteo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Sorteo_juegoCodigo_fecha_idx" ON "Sorteo"("juegoCodigo", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Sorteo_juegoCodigo_nroConcurso_key" ON "Sorteo"("juegoCodigo", "nroConcurso");

-- CreateIndex
CREATE UNIQUE INDEX "ResultadoModalidad_sorteoId_modalidadCodigo_key" ON "ResultadoModalidad"("sorteoId", "modalidadCodigo");

-- CreateIndex
CREATE INDEX "Escalon_resultadoId_idx" ON "Escalon"("resultadoId");

-- CreateIndex
CREATE INDEX "LecturaFuente_juegoCodigo_nroConcurso_idx" ON "LecturaFuente"("juegoCodigo", "nroConcurso");
