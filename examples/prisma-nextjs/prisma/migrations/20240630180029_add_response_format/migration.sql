-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "responseFormat" JSONB NOT NULL DEFAULT '{ "type": "text" }';
