import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const target = process.argv[2];
const allowedTargets = new Set(["dev", "production"]);

if (!target || !allowedTargets.has(target)) {
  console.error("Usage: tsx scripts/release.ts <dev|production>");
  process.exit(1);
}

const urls = {
  dev: {
    api: "https://api-dev-notes.dpklabs.com",
    web: "https://dev-notes.dpklabs.com",
  },
  production: {
    api: "https://api.notes.dpklabs.com",
    web: "https://notes.dpklabs.com",
  },
} as const;

function run(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function capture(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

async function confirmProduction() {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question('Type "deploy production" to continue: ');
    if (answer !== "deploy production") {
      console.error("Production deploy cancelled.");
      process.exit(1);
    }
  } finally {
    rl.close();
  }
}

async function smoke(url: string, label: string) {
  console.log(`\nSmoke: ${label} ${url}`);
  const response = await fetch(url, { redirect: "manual" });
  if (response.status >= 400) {
    throw new Error(`${label} smoke failed with status ${response.status}`);
  }
  console.log(`✓ ${label} responded ${response.status}`);
}

async function main() {
  const branch = capture("git", ["branch", "--show-current"]);
  const status = capture("git", ["status", "--short"]);

  if (target === "production") {
    if (branch !== "main") {
      console.error(`Production deploy must run from main. Current branch: ${branch ?? "unknown"}`);
      process.exit(1);
    }
    if (status) {
      console.error("Production deploy requires a clean working tree:");
      console.error(status);
      process.exit(1);
    }
    await confirmProduction();
  } else if (status) {
    console.warn("Warning: deploying dev with uncommitted changes:");
    console.warn(status);
  }

  run("pnpm", ["typecheck"]);
  run("pnpm", ["test"]);
  run("pnpm", ["build"]);
  run("pnpm", [`db:migrate:${target}`]);
  run("pnpm", [`deploy:${target}`]);

  await smoke(`${urls[target as keyof typeof urls].api}/health`, "API health");
  await smoke(urls[target as keyof typeof urls].web, "Web");

  console.log(`\n✓ ${target} release complete`);
}

main().catch((error) => {
  console.error("Release failed:");
  console.error(error);
  process.exit(1);
});
