-- Las categorías base (userId NULL, compartidas) pasan a ser una copia propia de cada cuenta.
-- Los gastos y presupuestos de cada cuenta se mueven a su copia, así no se pierde nada.

BEGIN;

-- Una fila por cada (cuenta, categoría base). Si la cuenta ya tenía una propia con el mismo
-- nombre, se reusa esa en vez de crear otra (no puede haber dos con el mismo nombre).
CREATE TEMP TABLE "category_copies" AS
SELECT
  b."id" AS "baseId",
  u."id" AS "userId",
  COALESCE(own."id", 'c' || replace(gen_random_uuid()::text, '-', '')) AS "newId",
  own."id" IS NULL AS "isNew",
  b."name", b."emoji", b."icon", b."keywords"
FROM "categories" b
CROSS JOIN "users" u
LEFT JOIN "categories" own ON own."userId" = u."id" AND own."name" = b."name"
WHERE b."userId" IS NULL;

INSERT INTO "categories" ("id", "name", "emoji", "icon", "keywords", "userId", "createdAt")
SELECT "newId", "name", "emoji", "icon", "keywords", "userId", CURRENT_TIMESTAMP
FROM "category_copies" WHERE "isNew";

UPDATE "expenses" e SET "categoryId" = c."newId"
FROM "category_copies" c
WHERE e."categoryId" = c."baseId" AND e."userId" = c."userId";

UPDATE "budgets" bu SET "categoryId" = c."newId"
FROM "category_copies" c
WHERE bu."categoryId" = c."baseId" AND bu."userId" = c."userId";

-- Ya nadie usa las compartidas. Si quedara algún gasto apuntando a una, el borrado falla
-- (la relación es Restrict) y, por el BEGIN/COMMIT, la migración entera se deshace.
DELETE FROM "categories" WHERE "userId" IS NULL;

DROP TABLE "category_copies";

-- AlterTable
ALTER TABLE "categories" ALTER COLUMN "userId" SET NOT NULL;

COMMIT;
