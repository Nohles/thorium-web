import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = process.argv[2]
  ? path.resolve(process.argv[2])
  : fileURLToPath(new URL("../dist/", import.meta.url));
const entry = path.join(dist, "components/Reader/index.mjs");
const formats = [
  "components/Epub/StatefulReader.tsx",
  "components/WebPub/StatefulReader.tsx",
  "components/Audio/StatefulPlayer.tsx",
  "components/Comic/StatefulComicReader.tsx",
];

// tsup emits one-line ESM imports/re-exports and adjacent source maps. Inspect
// the actual package artifacts, including the consumer-facing export boundary.
const modules = new Map();
async function moduleAt(file) {
  if (modules.has(file)) return modules.get(file);
  const code = await readFile(file, "utf8");
  const map = JSON.parse(await readFile(`${file}.map`, "utf8"));
  const local = (specifier) => specifier.startsWith(".")
    ? path.resolve(path.dirname(file), specifier) : null;
  const staticImports = [...code.matchAll(/^(?:import\s+(?:[^'"\n]*?\s+from\s+)?|export\s+[^'"\n]*?\s+from\s+)["']([^"']+)["']/gm)]
    .map((match) => local(match[1])).filter(Boolean);
  const dynamicImports = [...code.matchAll(/\bimport\(["']([^"']+)["']\)/g)]
    .map((match) => local(match[1])).filter(Boolean);
  const entryModule = { code, sources: map.sources, staticImports, dynamicImports };
  modules.set(file, entryModule);
  return entryModule;
}

async function exportedFrom(file, name, visited = new Set()) {
  assert(!visited.has(file), `Circular re-export for ${name}`);
  visited.add(file);
  const { code } = await moduleAt(file);
  for (const match of code.matchAll(/^export\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/gm)) {
    for (const binding of match[1].split(",")) {
      const [original, alias = original] = binding.trim().split(/\s+as\s+/);
      if (alias === name) return exportedFrom(path.resolve(path.dirname(file), match[2]), original, visited);
    }
  }
  assert(code.includes(name), `Missing public export ${name}`);
  return file;
}

async function closure(start, dynamic = false) {
  const found = new Set();
  async function visit(file) {
    if (found.has(file)) return;
    found.add(file);
    const entryModule = await moduleAt(file);
    for (const child of [...entryModule.staticImports, ...(dynamic ? entryModule.dynamicImports : [])]) await visit(child);
  }
  await visit(start);
  return [...found].flatMap((file) => modules.get(file).sources);
}

for (const name of ["StatefulReaderWrapper", "StatefulReadAlongBar"]) {
  const implementation = await exportedFrom(entry, name);
  const eager = await closure(implementation);
  for (const format of formats) {
    assert(!eager.some((source) => source.endsWith(`/${format}`)), `${name} eagerly includes ${format}`);
  }
}
const reachable = await closure(await exportedFrom(entry, "StatefulReaderWrapper"), true);
for (const format of formats) {
  assert(reachable.some((source) => source.endsWith(`/${format}`)), `Reader cannot load ${format}`);
}
console.log("Reader bundle: shared hosts exclude all four format implementations; lazy readers remain reachable.");
