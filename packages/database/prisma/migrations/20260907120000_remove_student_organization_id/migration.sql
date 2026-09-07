-- DropForeignKey
ALTER TABLE "students" DROP CONSTRAINT "students_organizationId_fkey";

-- DropIndex
DROP INDEX "students_organizationId_idx";

-- DropIndex
DROP INDEX "students_organizationId_studentId_key";

-- AlterTable
ALTER TABLE "students" DROP COLUMN "organizationId";

-- CreateIndex
CREATE UNIQUE INDEX "students_studentId_key" ON "students"("studentId");
