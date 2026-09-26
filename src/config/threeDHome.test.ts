import { isThreeDHomeEnabled } from "./threeDHome";

describe("3D Home feature gate", () => {
  const previous = process.env.EXPO_PUBLIC_ENABLE_3D_HOME;

  afterEach(() => {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_ENABLE_3D_HOME;
    else process.env.EXPO_PUBLIC_ENABLE_3D_HOME = previous;
  });

  it("defaults to enabled for an unconfigured integration build", () => {
    delete process.env.EXPO_PUBLIC_ENABLE_3D_HOME;
    expect(isThreeDHomeEnabled()).toBe(true);
    expect(isThreeDHomeEnabled("")).toBe(true);
  });

  it("accepts an explicit enabled flag", () => {
    expect(isThreeDHomeEnabled("true")).toBe(true);
    expect(isThreeDHomeEnabled(" TRUE ")).toBe(true);
  });

  it("disables the feature for false or unrecognized flag values", () => {
    expect(isThreeDHomeEnabled("false")).toBe(false);
    expect(isThreeDHomeEnabled(" FALSE ")).toBe(false);
    expect(isThreeDHomeEnabled("enabled")).toBe(false);
    process.env.EXPO_PUBLIC_ENABLE_3D_HOME = "false";
    expect(isThreeDHomeEnabled()).toBe(false);
  });
});
