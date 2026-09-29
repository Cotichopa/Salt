-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notifyCardDue" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyMonthly" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyWeekly" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notices_userId_key_key" ON "notices"("userId", "key");

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
