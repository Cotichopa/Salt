-- AlterTable
ALTER TABLE "password_resets" ADD COLUMN     "invite" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "chop_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "Source" NOT NULL,
    "kind" TEXT NOT NULL,
    "aiCalls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "understood" BOOLEAN NOT NULL DEFAULT true,
    "text" TEXT,

    CONSTRAINT "chop_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_errors" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,

    CONSTRAINT "server_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "default_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "default_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chop_messages_createdAt_idx" ON "chop_messages"("createdAt");

-- CreateIndex
CREATE INDEX "chop_messages_userId_createdAt_idx" ON "chop_messages"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "server_errors_createdAt_idx" ON "server_errors"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "default_categories_name_key" ON "default_categories"("name");

-- AddForeignKey
ALTER TABLE "chop_messages" ADD CONSTRAINT "chop_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Las categorías iniciales que estaban fijas en el código (categories.ts), ahora editables
INSERT INTO "default_categories" ("id", "name", "icon", "emoji", "keywords", "position") VALUES
  (gen_random_uuid()::text, 'Comida', 'utensils', '🍔', ARRAY['almuerzo', 'cena', 'desayuno', 'delivery', 'pizza', 'rotiseria']::TEXT[], 0),
  (gen_random_uuid()::text, 'Supermercado', 'cart', '🛒', ARRAY['super', 'chino', 'almacen', 'verduleria', 'carniceria']::TEXT[], 1),
  (gen_random_uuid()::text, 'Salidas', 'beer', '🍻', ARRAY['salida', 'bar', 'boliche', 'cine', 'birra', 'cumple']::TEXT[], 2),
  (gen_random_uuid()::text, 'Nafta', 'fuel', '⛽', ARRAY['combustible', 'gnc', 'ypf', 'shell', 'axion']::TEXT[], 3),
  (gen_random_uuid()::text, 'Transporte', 'taxi', '🚕', ARRAY['taxi', 'uber', 'cabify', 'colectivo', 'sube', 'peaje', 'estacionamiento']::TEXT[], 4),
  (gen_random_uuid()::text, 'Servicios', 'lightbulb', '💡', ARRAY['luz', 'gas', 'agua', 'internet', 'celular', 'expensas']::TEXT[], 5),
  (gen_random_uuid()::text, 'Salud', 'pill', '💊', ARRAY['farmacia', 'medico', 'remedios', 'prepaga', 'dentista']::TEXT[], 6),
  (gen_random_uuid()::text, 'Hogar', 'house', '🏠', ARRAY['alquiler', 'ferreteria', 'limpieza', 'muebles']::TEXT[], 7),
  (gen_random_uuid()::text, 'Ropa', 'shirt', '👕', ARRAY['zapatillas', 'remera', 'pantalon']::TEXT[], 8),
  (gen_random_uuid()::text, 'Suscripciones', 'tv', '📺', ARRAY['netflix', 'spotify', 'disney', 'youtube', 'gimnasio']::TEXT[], 9),
  (gen_random_uuid()::text, 'Otros', 'package', '📦', ARRAY[]::TEXT[], 10);
