-- CreateEnum
CREATE TYPE "DollarType" AS ENUM ('MEP', 'BLUE', 'OFICIAL', 'TARJETA', 'CRIPTO');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "amountArs" DECIMAL(14,2),
ADD COLUMN     "amountUsd" DECIMAL(14,2),
ADD COLUMN     "dollarType" "DollarType",
ADD COLUMN     "rate" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "type" "DollarType" NOT NULL,
    "date" DATE NOT NULL,
    "buy" DECIMAL(14,2) NOT NULL,
    "sell" DECIMAL(14,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("type","date")
);


-- Gastos ya cargados: solo lo obvio (un gasto en pesos vale eso en pesos, uno en dólares vale
-- eso en dólares). La otra moneda queda vacía: esos gastos no se convierten.
UPDATE "expenses" SET "amountArs" = "amount" WHERE "currency" = 'ARS';
UPDATE "expenses" SET "amountUsd" = "amount" WHERE "currency" = 'USD';
