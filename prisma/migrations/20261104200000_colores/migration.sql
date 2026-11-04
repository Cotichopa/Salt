-- Estilo de cada persona ("sober": como siempre; "color": categorías y módulos con color)
ALTER TABLE "users" ADD COLUMN "colorStyle" TEXT NOT NULL DEFAULT 'sober';

-- Color de cada categoría
ALTER TABLE "categories" ADD COLUMN "color" TEXT NOT NULL DEFAULT 'azul';
ALTER TABLE "default_categories" ADD COLUMN "color" TEXT NOT NULL DEFAULT 'azul';

-- A las que ya existen se les reparten los 8 colores en orden, por cuenta
UPDATE "categories" c
SET "color" = (ARRAY['azul','naranja','turquesa','ambar','rosa','verde','violeta','celeste'])[((r.n - 1) % 8) + 1]
FROM (SELECT "id", row_number() OVER (PARTITION BY "userId" ORDER BY "createdAt", "name") AS n FROM "categories") r
WHERE c."id" = r."id";

UPDATE "default_categories" c
SET "color" = (ARRAY['azul','naranja','turquesa','ambar','rosa','verde','violeta','celeste'])[((r.n - 1) % 8) + 1]
FROM (SELECT "id", row_number() OVER (ORDER BY "position", "name") AS n FROM "default_categories") r
WHERE c."id" = r."id";
