-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('IN_PROGRESS', 'INCOMPLETE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'REQUIRES_ACTION', 'CANCELLING', 'CANCELLED', 'FAILED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RunStepType" AS ENUM ('MESSAGE_CREATION', 'TOOL_CALLS');

-- CreateEnum
CREATE TYPE "RunStepStatus" AS ENUM ('IN_PROGRESS', 'CANCELLED', 'FAILED', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "assistantId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "threadId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" JSONB NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'COMPLETED',
    "assistantId" TEXT,
    "runId" TEXT,
    "completedAt" TIMESTAMP(3),
    "incompleteAt" TIMESTAMP(3),
    "incompleteDetails" JSONB,
    "attachments" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "metadata" JSONB,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "threadId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "requiredAction" JSONB,
    "lastError" JSONB,
    "expiresAt" INTEGER NOT NULL,
    "startedAt" INTEGER,
    "cancelledAt" INTEGER,
    "failedAt" INTEGER,
    "completedAt" INTEGER,
    "model" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "tools" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "metadata" JSONB,
    "usage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunStep" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "threadId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" "RunStepType" NOT NULL,
    "status" "RunStepStatus" NOT NULL,
    "stepDetails" JSONB NOT NULL,
    "lastError" JSONB,
    "expiredAt" INTEGER,
    "cancelledAt" INTEGER,
    "failedAt" INTEGER,
    "completedAt" INTEGER,
    "metadata" JSONB,
    "usage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assistant" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assistant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Thread_assistantId_idx" ON "Thread"("assistantId");

-- CreateIndex
CREATE INDEX "Thread_createdAt_idx" ON "Thread"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Message_threadId_idx" ON "Message"("threadId");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "RunStep_threadId_runId_type_status_idx" ON "RunStep"("threadId", "runId", "type", "status");

-- CreateIndex
CREATE INDEX "RunStep_createdAt_idx" ON "RunStep"("createdAt" ASC);

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunStep" ADD CONSTRAINT "RunStep_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunStep" ADD CONSTRAINT "RunStep_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunStep" ADD CONSTRAINT "RunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
