import { spawnSync } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

const target = process.argv[2];
const allowedTargets = new Set(['dev', 'production']);

if (!target || !allowedTargets.has(target)) {
  console.error('Usage: tsx scripts/down.ts <dev|production>');
  process.exit(1);
}

async function confirm() {
  const expected = target === 'production' ? 'remove production' : 'remove dev';
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`Type "${expected}" to continue: `);
    if (answer !== expected) {
      console.error('Remove cancelled.');
      process.exit(1);
    }
  } finally {
    rl.close();
  }
}

async function main() {
  await confirm();
  const env = target === 'production' ? 'production' : 'development';
  const stage = target === 'production' ? 'production' : 'dev';
  const result = spawnSync('sst', ['remove', '--stage', stage], {
    stdio: 'inherit',
    env: { ...process.env, ENVIRONMENT: env },
  });
  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error('Remove failed:');
  console.error(error);
  process.exit(1);
});
