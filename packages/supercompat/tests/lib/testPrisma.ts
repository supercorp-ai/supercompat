/**
 * Shared PrismaClient factory for tests.
 */
import { PrismaClient } from '@prisma/client'

export function createTestPrisma(): PrismaClient {
  return new PrismaClient()
}

let _shared: PrismaClient | null = null
export function getSharedTestPrisma(): PrismaClient {
  if (!_shared) _shared = new PrismaClient()
  return _shared
}
