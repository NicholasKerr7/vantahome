import React from "react";
import { TextInput } from "react-native";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import ManageRoomsScreen from "../ManageRoomsScreen";
import Pressable from "../../components/Pressable";
import ModalCard from "../../components/ModalCard";
import { useHomeStore } from "../../store/useHomeStore";

let mockDimensions = { width: 375, height: 667, scale: 1, fontScale: 1 };

jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@expo/vector-icons/Ionicons", () => require("react-native").View);
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => mockDimensions }));

const seed = useHomeStore.getState();
const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const rooms = ["Living room", "Kitchen", "Bedroom", "Studio"].map((name, index) => ({ id: `room-${index}`, name }));

describe("Rooms workspace", () => {
  let tree: ReactTestRenderer;
  beforeEach(() => {
    jest.clearAllMocks();
    mockDimensions = { width: 375, height: 667, scale: 1, fontScale: 1 };
    useHomeStore.setState({ ...seed, rooms, devices: [], household: [{ id: "owner", name: "Owner", role: "Owner", status: "home" }], activeMemberId: "owner", memberPermissionOverrides: [] });
    act(() => { tree = renderer.create(<ManageRoomsScreen navigation={navigation as never} route={{ key: "rooms", name: "ManageRooms" } as never} />); });
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

  it("fits complete rows to the measured phone area and keeps remaining rooms reachable", () => {
    act(() => tree.root.findByProps({ testID: "room-index-area" }).props.onLayout({ nativeEvent: { layout: { width: 343, height: 330 } } }));
    expect(tree.root.findAllByType(Pressable).filter((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel?.startsWith("Open "))).toHaveLength(3);
    press("Next rooms");
    expect(action("Open Studio")).toBeDefined();
    expect(action("Next rooms").props.disabled).toBe(true);
  });

  it("reserves more row space for large text instead of clipping the next room", () => {
    mockDimensions = { ...mockDimensions, fontScale: 1.6 };
    act(() => tree.update(<ManageRoomsScreen navigation={navigation as never} route={{ key: "rooms", name: "ManageRooms" }} />));
    act(() => tree.root.findByProps({ testID: "room-index-area" }).props.onLayout({ nativeEvent: { layout: { width: 343, height: 330 } } }));
    expect(tree.root.findAllByType(Pressable).filter((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel?.startsWith("Open "))).toHaveLength(2);
    press("Next rooms");
    expect(action("Open Studio")).toBeDefined();
  });

  it("opens a room directly while its separate Manage action opens only the editor", () => {
    press("Open Living room");
    expect(navigation.navigate).toHaveBeenCalledWith("Room", { roomId: "room-0" });
    expect(tree.root.findAllByType(ModalCard)).toHaveLength(0);
    expect(action("Open Living room").findAllByType(Pressable)).toHaveLength(1);
    navigation.navigate.mockClear();
    press("Manage Living room");
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(ModalCard)).toHaveLength(1);
  });

  it("does not open a room that became unavailable after the card rendered", () => {
    const open = action("Open Living room").props.onPress;
    act(() => { useHomeStore.setState({ rooms: rooms.slice(1) }); });
    act(() => open());
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

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

  it("keeps room details available and removes administration actions for ordinary members", () => {
    act(() => { useHomeStore.setState({ household: [{ id: "member", name: "Member", role: "Member", status: "home" }], activeMemberId: "member" }); });
    expect(() => action("Add room")).toThrow('Missing action');
    press("Details for Living room");
    expect(() => action("Save")).toThrow('Missing action');
    expect(() => action("Delete Living room")).toThrow('Missing action');
    expect(() => action("Move Living room up")).toThrow('Missing action');
    press("Open room");
    expect(navigation.navigate).toHaveBeenCalledWith("Room", { roomId: "room-0" });
  });

  it("renders one assigned room for a guest without unstable selector snapshots", () => {
    act(() => { useHomeStore.setState({
      household: [{ id: 'guest', name: 'Guest', role: 'Guest', status: 'home' }], activeMemberId: 'guest',
      roomMembers: [{ memberId: 'guest', roomIds: ['room-2'] }],
      devices: [{ id: 'bedroom-lamp', roomId: 'room-2', name: 'Bedside lamp', kind: 'light', isOn: false }],
    }); });
    expect(action('Open Bedroom')).toBeDefined();
    expect(() => action('Open Living room')).toThrow('Missing action');
    expect(() => action('Add room')).toThrow('Missing action');
    press('Details for Bedroom');
    expect(action('Open room')).toBeDefined();
    expect(() => action('Save')).toThrow('Missing action');
    act(() => { useHomeStore.setState({ devices: [{ ...useHomeStore.getState().devices[0], isOn: true }] }); });
    expect(action('Open room')).toBeDefined();
  });
  it("shows authored room metadata and opens the room without structural edits", () => {
    act(() => { useHomeStore.setState({ modelCatalogVersion: 1, accountUserId: null, authenticatedUserId: null, accountHomeId: null, activeHomeId: null,
      realtime: { ...seed.realtime, enabled: false, useMqtt: false }, rooms: [{ id: "living", name: "Living room" }] }); });
    expect(tree.root.findAllByType(Pressable).some((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === "Add room")).toBe(false);
    press("Manage Living room");
    expect(tree.root.findAllByType(TextInput).some((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === "Living room room name")).toBe(false);
    expect(tree.root.findAllByType(Pressable).some((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === "Delete Living room")).toBe(false);
    press("Open room");
    expect(navigation.navigate).toHaveBeenCalledWith("Room", { roomId: "living" });
  });

});
