-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accentColor" TEXT NOT NULL DEFAULT 'neutral',
ADD COLUMN     "defaultCurrency" "Currency" NOT NULL DEFAULT 'ARS',
ADD COLUMN     "defaultDollarType" "DollarType" NOT NULL DEFAULT 'MEP',
ADD COLUMN     "defaultPaymentMethod" "PaymentMethod" NOT NULL DEFAULT 'DEBIT',
ADD COLUMN     "homePage" TEXT NOT NULL DEFAULT '/dashboard';
