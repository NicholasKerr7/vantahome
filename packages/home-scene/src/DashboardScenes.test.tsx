import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardScenes } from "./DashboardChrome";
import type { SceneCatalog } from "./sceneCatalogProtocol";

const shared = vi.hoisted(() => ({
  catalog: { scenes: [], activeSceneId: null } as SceneCatalog,
  status: "ready" as "ready" | "loading" | "error",
}));
vi.mock("./useSceneCatalog", () => ({
  useSceneCatalog: () => ({ ...shared, runScene: vi.fn(), retry: vi.fn() }),
}));

describe("saved scene shortcuts", () => {
  beforeEach(() => {
    shared.catalog = { scenes: [], activeSceneId: null };
    shared.status = "ready";
  });

  it("shows native custom names and active identity without adding a second hardcoded collection", () => {
    shared.catalog = {
      scenes: [
        {
          id: "custom",
          name: "Quiet evening",
          scope: "Whole home",
          deviceCount: 3,
        },
      ],
      activeSceneId: "custom",
    };
    const markup = renderToStaticMarkup(<DashboardScenes />);
    expect(markup).toContain("Quiet evening");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain("Morning");
    expect(markup).not.toContain("Movie time");
  });

  it("pages longer collections within the existing compact row", () => {
    shared.catalog.scenes = Array.from({ length: 7 }, (_, index) => ({
      id: `scene-${index}`,
      name: `Saved scene ${index}`,
      scope: "Whole home",
      deviceCount: 1,
    }));
    const markup = renderToStaticMarkup(<DashboardScenes />);
    expect(markup).toContain("Previous scenes");
    expect(markup).toContain("Next scenes");
    expect(markup).toContain("Saved scene 2");
    expect(markup).not.toContain("Saved scene 3");
  });

  it("distinguishes loading, empty and failed catalog states", () => {
    expect(renderToStaticMarkup(<DashboardScenes />)).toContain(
      "No saved scenes",
    );
    shared.status = "loading";
    expect(renderToStaticMarkup(<DashboardScenes />)).toContain(
      "Loading scenes",
    );
    shared.status = "error";
    expect(renderToStaticMarkup(<DashboardScenes />)).toContain("Retry scenes");
  });
});
