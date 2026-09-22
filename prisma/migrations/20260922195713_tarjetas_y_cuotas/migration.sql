-- CreateEnum
CREATE TYPE "PaymentSourceKind" AS ENUM ('CARD', 'WALLET');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "installmentNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "installments" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "paymentSourceId" TEXT,
ADD COLUMN     "purchaseId" TEXT;

-- CreateTable
CREATE TABLE "payment_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PaymentSourceKind" NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_sources_userId_name_key" ON "payment_sources"("userId", "name");

-- CreateIndex
CREATE INDEX "expenses_purchaseId_idx" ON "expenses"("purchaseId");

-- AddForeignKey
ALTER TABLE "payment_sources" ADD CONSTRAINT "payment_sources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paymentSourceId_fkey" FOREIGN KEY ("paymentSourceId") REFERENCES "payment_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
