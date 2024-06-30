-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "truncationStrategy" JSONB NOT NULL DEFAULT '{ "type": "auto" }';
