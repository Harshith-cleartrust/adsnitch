-- AlterTable
ALTER TABLE "blocked_keywords" ADD COLUMN "category" TEXT;

-- AlterTable
ALTER TABLE "policy_categories" ALTER COLUMN "enabled" SET DEFAULT false;
