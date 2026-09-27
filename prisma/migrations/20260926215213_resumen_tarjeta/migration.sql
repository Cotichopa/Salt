-- AlterTable
ALTER TABLE "payment_sources" ADD COLUMN     "closingDay" INTEGER,
ADD COLUMN     "dueDay" INTEGER;

-- CreateTable
CREATE TABLE "card_statements" (
    "id" TEXT NOT NULL,
    "paymentSourceId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "closingDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,

    CONSTRAINT "card_statements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_statements_paymentSourceId_month_key" ON "card_statements"("paymentSourceId", "month");

-- AddForeignKey
ALTER TABLE "card_statements" ADD CONSTRAINT "card_statements_paymentSourceId_fkey" FOREIGN KEY ("paymentSourceId") REFERENCES "payment_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
