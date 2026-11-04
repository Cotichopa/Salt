-- Se sumaron 6 colores. Las categorías que repetían uno (de la novena en adelante, por cuenta) pasan a
-- los nuevos, en orden: las primeras 8 no cambian.
UPDATE "categories" c
SET "color" = (ARRAY['cielo','lima','cacao','magenta','bordo','arena'])[((r.n - 9) % 6) + 1]
FROM (SELECT "id", row_number() OVER (PARTITION BY "userId" ORDER BY "createdAt", "name") AS n FROM "categories") r
WHERE c."id" = r."id" AND r.n > 8;

UPDATE "default_categories" c
SET "color" = (ARRAY['cielo','lima','cacao','magenta','bordo','arena'])[((r.n - 9) % 6) + 1]
FROM (SELECT "id", row_number() OVER (ORDER BY "position", "name") AS n FROM "default_categories") r
WHERE c."id" = r."id" AND r.n > 8;
