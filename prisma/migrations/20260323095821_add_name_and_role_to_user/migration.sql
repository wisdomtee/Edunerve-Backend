-- AlterTable
ALTER TABLE "User" ADD COLUMN     "name" TEXT,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'admin';
