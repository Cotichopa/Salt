-- CreateTable
CREATE TABLE "card_payments" (
    "id" TEXT NOT NULL,
    "paymentSourceId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "usdPaidIn" "Currency" NOT NULL DEFAULT 'ARS',
    "rate" DECIMAL(14,2),
    "totalArs" DECIMAL(14,2) NOT NULL,
    "totalUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_payments_paymentSourceId_month_key" ON "card_payments"("paymentSourceId", "month");

-- AddForeignKey
ALTER TABLE "card_payments" ADD CONSTRAINT "card_payments_paymentSourceId_fkey" FOREIGN KEY ("paymentSourceId") REFERENCES "payment_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
