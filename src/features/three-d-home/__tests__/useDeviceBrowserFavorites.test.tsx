import { act, renderHook } from "@testing-library/react-native";
import { getDevice } from "../../../../packages/home-scene/src/data";
import { useHomeStore } from "../../../store/useHomeStore";
import {
  canUseModelFavorites,
  useDeviceBrowserFavorites,
} from "../useDeviceBrowserFavorites";
import { modelDeviceFavorites } from "../deviceBrowserPreferences";

jest.mock("../../../config/runtimeMode", () => ({
  runtimePolicy: { mode: "demo", allowUnauthenticatedDemo: true },
}));
const seed = useHomeStore.getState();

beforeEach(() => {
  const device = getDevice("living-light")!;
  useHomeStore.setState({
    ...seed,
    modelCatalogVersion: 1,
    accountUserId: null,
    authenticatedUserId: null,
    accountHomeId: null,
    activeHomeId: null,
    realtime: { ...seed.realtime, enabled: false, useMqtt: false },
    household: [{ id: "owner", name: "Owner", role: "Owner", status: "home" }],
    activeMemberId: "owner",
    rooms: [{ id: "living", name: "Living room" }],
    devices: [
      {
        id: device.id,
        name: device.name,
        kind: device.kind,
        roomId: device.roomId,
        isOn: false,
      },
    ],
  });
});
afterEach(() => {
  useHomeStore.setState(seed);
  jest.restoreAllMocks();
});

test("hides cached offline favorites immediately when account scope changes", async () => {
  await modelDeviceFavorites.load();
  jest
    .spyOn(modelDeviceFavorites, "getSnapshot")
    .mockReturnValue({ ids: ["living-light"], status: "saved" });
  const toggle = jest
    .spyOn(modelDeviceFavorites, "toggle")
    .mockImplementation(() => undefined);
  const { result } = renderHook(() => useDeviceBrowserFavorites());
  expect(result.current.ids).toEqual(["living-light"]);
  const staleToggle = result.current.toggle;
  act(() => {
    useHomeStore.setState({ authenticatedUserId: "account-a" });
  });
  expect(result.current.enabled).toBe(false);
  expect(result.current.ids).toEqual([]);
  act(() => staleToggle("living-light"));
  expect(toggle).not.toHaveBeenCalled();
});

test("requires the authored offline owner scope and current device visibility", async () => {
  await modelDeviceFavorites.load();
  const toggle = jest
    .spyOn(modelDeviceFavorites, "toggle")
    .mockImplementation(() => undefined);
  const { result } = renderHook(() => useDeviceBrowserFavorites());
  act(() => result.current.toggle("master-ac"));
  expect(toggle).not.toHaveBeenCalled();
  act(() => result.current.toggle("living-light"));
  expect(toggle).toHaveBeenCalledWith("living-light");
  const home = useHomeStore.getState();
  expect(
    canUseModelFavorites({ ...home, modelCatalogVersion: undefined }),
  ).toBe(false);
  expect(
    canUseModelFavorites({
      ...home,
      realtime: { ...home.realtime, enabled: true },
    }),
  ).toBe(false);
  expect(
    canUseModelFavorites({
      ...home,
      household: [
        { id: "owner", name: "Guest", role: "Guest", status: "home" },
      ],
    }),
  ).toBe(false);
  expect(canUseModelFavorites({ ...home, accountHomeId: "remote-home" })).toBe(
    false,
  );
});
