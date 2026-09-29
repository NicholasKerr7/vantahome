import React from "react";
import { TextInput } from "react-native";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import ManageRoomsScreen from "../ManageRoomsScreen";
import Pressable from "../../components/Pressable";
import { useHomeStore } from "../../store/useHomeStore";

jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@expo/vector-icons/Ionicons", () => require("react-native").View);

const seed = useHomeStore.getState();
const rooms = ["Living room", "Kitchen", "Bedroom", "Studio"].map((name, index) => ({ id: `room-${index}`, name }));

describe("Rooms workspace", () => {
  let tree: ReactTestRenderer;
  beforeEach(() => {
    useHomeStore.setState({ ...seed, rooms, devices: [], household: [{ id: "owner", name: "Owner", role: "Owner", status: "home" }], activeMemberId: "owner", memberPermissionOverrides: [] });
    act(() => { tree = renderer.create(<ManageRoomsScreen navigation={{ goBack: jest.fn() } as never} route={{ key: "rooms", name: "ManageRooms" } as never} />); });
  });
  afterEach(() => { act(() => tree.unmount()); useHomeStore.setState(seed); });

  /** Read the interactive wrapper rather than duplicate native descendants. */
  function action(label: string) {
    const found = tree.root.findAllByType(Pressable).find((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === label);
    if (!found) throw new Error(`Missing action: ${label}`);
    return found;
  }

  /** Follow an accessible action through the same callback as a touch interaction. */
  function press(label: string) { act(() => action(label).props.onPress()); }

  /** Edit a visibly labelled field in the focused form. */
  function input(label: string, value: string) {
    act(() => { tree.root.findAllByType(TextInput).find((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === label)!.props.onChangeText(value); });
  }

  it("finds a room beyond the first page and preserves renaming through its detail sheet", () => {
    input("Find a room", "Studio");
    press("Manage Studio");
    input("Studio room name", "Creative studio");
    press("Save");
    expect(useHomeStore.getState().rooms[3].name).toBe("Creative studio");
  });

  it("retains room ordering actions within the detail sheet", () => {
    press("Manage Living room");
    expect(action("Move Living room up").props.disabled).toBe(true);
    press("Move Living room down");
    expect(useHomeStore.getState().rooms.map((room) => room.id)).toEqual(["room-1", "room-0", "room-2", "room-3"]);
    expect(action("Move Living room up").props.disabled).toBe(false);
  });

  it("creates rooms and keeps the final room protected from deletion", () => {
    press("Add room");
    input("New room name", "Patio");
    press("Create");
    expect(useHomeStore.getState().rooms.some((room) => room.name === "Patio")).toBe(true);
    act(() => { useHomeStore.setState({ rooms: [rooms[0]] }); });
    press("Manage Living room");
    expect(action("Delete Living room").props.disabled).toBe(true);
    press("Delete Living room");
    expect(useHomeStore.getState().rooms).toHaveLength(1);
  });

  it("keeps room creation, rename, and delete disabled for ordinary members", () => {
    act(() => { useHomeStore.setState({ household: [{ id: "member", name: "Member", role: "Member", status: "home" }], activeMemberId: "member" }); });
    expect(action("Add room").props.disabled).toBe(true);
    press("Manage Living room");
    expect(action("Save").props.disabled).toBe(true);
    expect(action("Delete Living room").props.disabled).toBe(true);
  });
});
