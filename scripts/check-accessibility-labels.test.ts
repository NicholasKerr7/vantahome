import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/** Collect source components without treating TypeScript generic references as markup. */
function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("form accessibility labels", () => {
  test("labels every text input and switch", () => {
    const unlabeled: string[] = [];

    for (const path of tsxFiles("src")) {
      const source = readFileSync(path, "utf8");
      const file = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      /** Inspect actual JSX controls so types, comments, and strings cannot create false failures. */
      function inspect(node: ts.Node): void {
        if (
          (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
          ts.isIdentifier(node.tagName) &&
          ["TextInput", "Switch"].includes(node.tagName.text) &&
          !node.attributes.properties.some(
            (attribute) =>
              ts.isJsxAttribute(attribute) &&
              attribute.name.getText(file) === "accessibilityLabel",
          )
        ) {
          const { line } = file.getLineAndCharacterOfPosition(
            node.getStart(file),
          );
          unlabeled.push(`${path}:${line + 1} ${node.tagName.text}`);
        }
        ts.forEachChild(node, inspect);
      }
      inspect(file);
    }

    expect(unlabeled).toEqual([]);
  });
});
