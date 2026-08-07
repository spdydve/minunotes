import { cleanupExpiredTrash } from './cleanup';

export async function handler() {
  const result = await cleanupExpiredTrash();
  console.log('Trash cleanup complete', {
    ...result,
    cutoff: result.cutoff.toISOString(),
  });
  return result;
}
