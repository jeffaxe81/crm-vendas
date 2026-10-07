import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { format, resolveConfig } from "prettier";
const source = await readFile(
  new URL("../apps/api/prisma/schema.prisma", import.meta.url),
  "utf8"
);
const blocks = [...source.matchAll(/^(model|enum) (\w+) \{\n([\s\S]*?)^\}/gm)];
const modelNames = new Set(blocks.filter(b => b[1] === "model").map(b => b[2]));
const enumNames = new Set(blocks.filter(b => b[1] === "enum").map(b => b[2]));
const scalars = new Set([
  "String",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "Boolean",
  "DateTime",
  "Json",
  "Bytes",
]);
const enums = blocks
  .filter(b => b[1] === "enum")
  .map(b => ({
    name: b[2],
    values: b[3]
      .split("\n")
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("//") && !l.startsWith("@@"))
      .map(l => {
        const match = /^(\w+)(?:\s+@map\("([^"\n]+)"\))?$/.exec(l);
        if (!match) throw Error(`Unsupported enum syntax: ${l}`);
        return { name: match[1], dbName: match[2] ?? match[1] };
      }),
  }));
const models = blocks
  .filter(b => b[1] === "model")
  .map(b => {
    const fields = b[3]
      .split("\n")
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("//") && !l.startsWith("@@"))
      .map(l => {
        const match = /^(\w+)\s+(\w+)(\[\]|\?)?(?:\s+(.*))?$/.exec(l);
        if (!match) throw Error(`Unsupported field syntax: ${l}`);
        const [, name, type, suffix, attrs = ""] = match;
        if (!modelNames.has(type) && !enumNames.has(type) && !scalars.has(type))
          throw Error(`Unknown field type: ${type}`);
        return {
          name,
          type,
          kind: modelNames.has(type)
            ? "object"
            : enumNames.has(type)
              ? "enum"
              : "scalar",
          dbName: /@map\("([^"\n]+)"\)/.exec(attrs)?.[1] ?? name,
          isRequired: suffix !== "?",
          isList: suffix === "[]",
          isId: /@id\b/.test(attrs),
          nativeType: /@db\.(\w+(?:\([^)]*\))?)/.exec(attrs)?.[1] ?? null,
          relationFromFields:
            /@relation\([^\n]*fields:\s*\[([^\]]*)\]/
              .exec(attrs)?.[1]
              .split(",")
              .map(v => v.trim()) ?? [],
        };
      });
    const primaryKey =
      /@@id\(\[([^\]]+)\]/
        .exec(b[3])?.[1]
        .split(",")
        .map(v => v.trim()) ?? fields.filter(f => f.isId).map(f => f.name);
    const dbName = /@@map\("([^"\n]+)"\)/.exec(b[3])?.[1];
    if (!dbName || !primaryKey.length)
      throw Error(`Missing table or primary key: ${b[2]}`);
    return { name: b[2], dbName, primaryKey, fields };
  });
const target = new URL(
  "../apps/api/src/data-management/backup-schema.json",
  import.meta.url
);
await writeFile(
  target,
  await format(
    JSON.stringify({
      schemaSha256: createHash("sha256").update(source).digest("hex"),
      models,
      enums,
    }),
    { ...(await resolveConfig(target.pathname)), parser: "json" }
  )
);
console.log(`Generated backup metadata for ${models.length} models`);
