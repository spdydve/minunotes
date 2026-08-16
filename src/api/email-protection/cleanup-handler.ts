import { cleanupExpiredEmailProtectionState } from './cleanup';

export async function handler() {
  const result = await cleanupExpiredEmailProtectionState();
  console.info('Email protection cleanup complete', result);
  return result;
}
