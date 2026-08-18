import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
      for (const match of source.matchAll(/<(TextInput|Switch)\b[^>]*>/gs)) {
        if (!match[0].includes("accessibilityLabel=")) {
          const line = source.slice(0, match.index).split("\n").length;
          unlabeled.push(`${path}:${line} ${match[1]}`);
        }
      }
    }

    expect(unlabeled).toEqual([]);
  });
});
