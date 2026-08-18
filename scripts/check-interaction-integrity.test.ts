import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("interaction integrity", () => {
  test("does not render Pressable controls without an activation handler", () => {
    const handlerless: string[] = [];

    for (const path of tsxFiles("src")) {
      const source = readFileSync(path, "utf8");
      const file = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );

      function visit(node: ts.Node) {
        if (
          (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
          node.tagName.getText(file) === "Pressable"
        ) {
          const attributes = new Set(
            node.attributes.properties
              .filter(ts.isJsxAttribute)
              .map((attribute) => attribute.name.getText(file)),
          );
          if (!attributes.has("onPress") && !attributes.has("onLongPress")) {
            const { line } = file.getLineAndCharacterOfPosition(
              node.getStart(file),
            );
            handlerless.push(`${path}:${line + 1}`);
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(file);
    }

    expect(handlerless).toEqual([]);
  });
});
