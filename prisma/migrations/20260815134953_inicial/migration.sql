-- CreateTable
CREATE TABLE "Sorteo" (
    "id" TEXT NOT NULL,
    "juegoCodigo" TEXT NOT NULL,
    "nroConcurso" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "verificadoEn" TIMESTAMP(3),
    "urlExtracto" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sorteo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultadoModalidad" (
    "id" TEXT NOT NULL,
    "sorteoId" TEXT NOT NULL,
    "modalidadCodigo" TEXT NOT NULL,
    "numeros" INTEGER[],
    "plus" INTEGER,
    "nivelGanador" INTEGER,

    CONSTRAINT "ResultadoModalidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalon" (
    "id" TEXT NOT NULL,
    "resultadoId" TEXT NOT NULL,
    "aciertos" INTEGER,
    "etiqueta" TEXT NOT NULL,
    "pozo" DOUBLE PRECISION NOT NULL,
    "ganadores" INTEGER NOT NULL,
    "premioUnitario" DOUBLE PRECISION NOT NULL,
    "vacante" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Escalon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LecturaFuente" (
    "id" TEXT NOT NULL,
    "sorteoId" TEXT,
    "juegoCodigo" TEXT NOT NULL,
    "nroConcurso" INTEGER NOT NULL,
    "fuente" TEXT NOT NULL,
    "huella" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "leidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LecturaFuente_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "ResultadoModalidad" ADD CONSTRAINT "ResultadoModalidad_sorteoId_fkey" FOREIGN KEY ("sorteoId") REFERENCES "Sorteo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalon" ADD CONSTRAINT "Escalon_resultadoId_fkey" FOREIGN KEY ("resultadoId") REFERENCES "ResultadoModalidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LecturaFuente" ADD CONSTRAINT "LecturaFuente_sorteoId_fkey" FOREIGN KEY ("sorteoId") REFERENCES "Sorteo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
