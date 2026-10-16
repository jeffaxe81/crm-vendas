import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { catalogs, translate } from "./messages";
import pt from "./catalogs/pt-BR.json";

describe("application translation catalogs", () => {
  it("translates core actions into English and Spanish", () => {
    expect(translate("en", "Salvar")).toBe("Save");
    expect(translate("es", "Salvar")).toBe("Guardar");
    expect(translate("en", "Idioma da aplicação")).toBe("Application language");
  });
  it("preserves whitespace, interpolation data and Portuguese fallback", () => {
    expect(translate("en", " Salvar ")).toBe(" Save ");
    expect(translate("en", "Editar {0}", { 0: "Empresas <script>" })).toBe(
      "Edit Empresas <script>"
    );
    expect(translate("en", "Unknown application message")).toBe(
      "Unknown application message"
    );
    expect(translate("es", "__proto__")).toBe("__proto__");
  });
  it.each(["en", "es"] as const)(
    "has complete keys and matching placeholders in %s",
    locale => {
      expect(Object.keys(catalogs[locale]).sort()).toEqual(
        Object.keys(pt).sort()
      );
      for (const [key, value] of Object.entries(catalogs[locale])) {
        expect(value.trim(), key).not.toBe("");
        expect(value.match(/\{\w+\}/g)?.sort() ?? [], key).toEqual(
          key.match(/\{\w+\}/g)?.sort() ?? []
        );
      }
    }
  );
  it("covers every literal message passed to t in application sources", () => {
    const missing = new Set<string>();
    function walk(directory: string) {
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, item.name);
        if (item.isDirectory()) {
          if (item.name !== "catalogs") walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(path) || /\.(test|spec)\./.test(path)) continue;
        const source = ts.createSourceFile(
          path,
          readFileSync(path, "utf8"),
          ts.ScriptTarget.Latest,
          true
        );
        function visit(node: ts.Node) {
          if (
            ts.isCallExpression(node) &&
            node.expression.getText(source) === "t" &&
            node.arguments[0] &&
            ts.isStringLiteral(node.arguments[0])
          ) {
            const key = node.arguments[0].text.trim();
            if (key && !Object.prototype.hasOwnProperty.call(pt, key))
              missing.add(key);
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
    walk(join(process.cwd(), "src"));
    expect([...missing]).toEqual([]);
  });
});
