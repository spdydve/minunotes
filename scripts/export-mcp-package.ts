import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const sourceDir = path.join(root, "packages/mcp");
const exportDir = path.join(root, ".release/minunotes-mcp");

async function main() {
  execFileSync("pnpm", ["--filter", "@minunotes/mcp", "build"], { stdio: "inherit" });

  const distDir = path.join(sourceDir, "dist");
  if (!existsSync(distDir)) throw new Error("MCP dist directory was not created");

  await rm(exportDir, { recursive: true, force: true });
  await mkdir(exportDir, { recursive: true });

  const sourcePackage = JSON.parse(await readFile(path.join(sourceDir, "package.json"), "utf8")) as {
    version: string;
    dependencies?: Record<string, string>;
  };

  const packageJson = {
    name: "minunotes-mcp",
    version: sourcePackage.version,
    description: "Local stdio MCP server for MinuNotes.",
    type: "module",
    license: "MIT",
    bin: { "notes-mcp": "./dist/index.js" },
    exports: {
      ".": "./dist/index.js",
      "./server": "./dist/server.js",
    },
    files: ["dist", "README.md"],
    scripts: {
      start: "node ./dist/index.js",
    },
    dependencies: {
      "@modelcontextprotocol/sdk": sourcePackage.dependencies?.["@modelcontextprotocol/sdk"] ?? "^1.29.0",
      zod: sourcePackage.dependencies?.zod ?? "^4.4.3",
    },
    repository: {
      type: "git",
      url: "git+https://github.com/spdydve/minunotes-mcp.git",
    },
  };

  await writeFile(path.join(exportDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  await cp(path.join(sourceDir, "README.md"), path.join(exportDir, "README.md"));
  await cp(distDir, path.join(exportDir, "dist"), { recursive: true });

  console.log(`Exported MinuNotes MCP package to ${path.relative(root, exportDir)}`);
  console.log("Next: cd .release/minunotes-mcp && npm pack --dry-run");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
