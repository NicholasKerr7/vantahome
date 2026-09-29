import React from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { TextInput } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../app/AppNavigator";
import Pressable from "../../components/Pressable";
import AutomationBuilderScreen from "../AutomationBuilderScreen";
import { RoutineStepEditor } from "./RoutineStepEditor";
import { selectRoutines } from "../../store/routines";
import {
  useHomeStore,
  type AutomationFlow,
  type AutomationRule,
  type Device,
} from "../../store/useHomeStore";

jest.mock("@expo/vector-icons/Ionicons", () => require("react-native").View);
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: require("react-native").View,
}));

const seed = useHomeStore.getState();
const device: Device = {
  id: "test-light",
  kind: "light",
  name: "Pendant",
  roomId: "test-room",
  isOn: false,
};
const rule: AutomationRule = {
  id: "legacy",
  name: "Evening lights",
  enabled: true,
  trigger: { type: "time", hour: 20, minute: 15 },
  action: { type: "toggle", deviceId: device.id, on: true },
};
const flow: AutomationFlow = {
  id: "flow",
  name: "Arrival",
  enabled: false,
  triggers: [{ type: "presence", memberId: "test-owner", status: "home" }],
  conditions: [{ type: "day", days: ["Mon"] }],
  actions: [
    { type: "notify", message: "Welcome" },
    { type: "delay", seconds: 30 },
    { type: "toggle", deviceId: device.id, on: true },
  ],
};
const goBack = jest.fn();
type Props = NativeStackScreenProps<RootStackParamList, "AutomationBuilder">;

/** Supply the existing route contract without mocking the routine store or its legacy adapter. */
function builder(params: RootStackParamList["AutomationBuilder"]) {
  return (
    <AutomationBuilderScreen
      navigation={{ goBack } as unknown as Props["navigation"]}
      route={{ key: "test", name: "AutomationBuilder", params }}
    />
  );
}

/** Invoke the labeled custom control once rather than matching duplicate native hosts. */
function press(tree: ReactTestRenderer, label: string) {
  const control = tree.root.findAllByType(Pressable).find(
    (node: {
      props: {
        accessibilityLabel?: string;
        onPress: () => void;
        value?: string;
      };
    }) => node.props.accessibilityLabel === label,
  );
  expect(control).toBeDefined();
  act(() => {
    control!.props.onPress();
  });
}

describe("unified routine builder", () => {
  let tree: ReactTestRenderer;
  beforeEach(() => {
    goBack.mockClear();
    useHomeStore.setState({
      ...seed,
      accountUserId: null,
      activeMemberId: "test-owner",
      household: [
        { id: "test-owner", name: "Owner", role: "Owner", status: "home" },
      ],
      rooms: [{ id: "test-room", name: "Living" }],
      devices: [device],
      rules: [rule],
      flows: [flow],
      scenes: [],
    });
  });
  afterEach(() => {
    if (tree) act(() => tree.unmount());
    useHomeStore.setState(seed);
  });

  it("edits a legacy schedule in the common builder and preserves every step", () => {
    act(() => {
      tree = renderer.create(builder({ routineId: "rule:legacy" }));
    });
    act(() => {
      tree.root
        .findByProps({ accessibilityLabel: "Routine name" })
        .props.onChangeText("Evening comfort");
    });
    press(tree, "Save routine");
    const saved = selectRoutines(useHomeStore.getState()).find(
      (routine) => routine.id === "rule:legacy",
    )!;
    expect(saved.name).toBe("Evening comfort");
    expect(saved.triggers).toEqual([rule.trigger]);
    expect(saved.actions).toEqual([rule.action]);
    expect(useHomeStore.getState().rules).toEqual([]);
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it("adds a condition to a legacy schedule without creating a second runnable record", () => {
    act(() => {
      tree = renderer.create(builder({ routineId: "rule:legacy" }));
    });
    press(tree, "Add conditions");
    press(tree, "Add condition");
    act(() => {
      tree.root
        .findByType(RoutineStepEditor)
        .props.onSave({ type: "day", days: ["Sat", "Sun"] });
    });
    press(tree, "Save routine");
    const all = selectRoutines(useHomeStore.getState());
    expect(all).toHaveLength(2);
    expect(
      all.find((routine) => routine.id === "rule:legacy")?.conditions,
    ).toEqual([{ type: "day", days: ["Sat", "Sun"] }]);
  });

  it("retains backward-compatible flow routes and deliberate action ordering", () => {
    act(() => {
      tree = renderer.create(builder({ flowId: "flow" }));
    });
    press(tree, "Do");
    press(tree, "Move action 3 earlier");
    press(tree, "Save routine");
    expect(
      selectRoutines(useHomeStore.getState()).find(
        (routine) => routine.id === "flow:flow",
      )?.actions,
    ).toEqual([flow.actions[0], flow.actions[2], flow.actions[1]]);
  });

  it("opens a device schedule as a prefilled routine and saves it through the same API", () => {
    act(() => {
      tree = renderer.create(builder({ deviceId: device.id, preset: "time" }));
    });
    expect(
      tree.root.findAllByType(TextInput).find(
        (node: {
          props: {
            accessibilityLabel?: string;
            onPress: () => void;
            value?: string;
          };
        }) => node.props.accessibilityLabel === "Routine name",
      )?.props.value,
    ).toBe("Pendant schedule");
    press(tree, "Save routine");
    const created = selectRoutines(useHomeStore.getState()).find(
      (routine) => routine.name === "Pendant schedule",
    )!;
    expect(created.triggers).toEqual([{ type: "time", hour: 7, minute: 0 }]);
    expect(created.actions).toEqual([
      { type: "toggle", deviceId: device.id, on: true },
    ]);
  });

  it("requires an explicit second action to delete and leaves records untouched on cancel", () => {
    act(() => {
      tree = renderer.create(builder({ routineId: "rule:legacy" }));
    });
    press(tree, "Delete routine");
    expect(selectRoutines(useHomeStore.getState())).toHaveLength(2);
    press(tree, "Keep routine");
    press(tree, "Delete routine");
    press(tree, "Confirm delete routine");
    expect(selectRoutines(useHomeStore.getState())).toHaveLength(1);
  });

  it("does not overwrite unsaved draft values when a device state update arrives", () => {
    act(() => {
      tree = renderer.create(builder({ routineId: "rule:legacy" }));
    });
    act(() => {
      tree.root
        .findByProps({ accessibilityLabel: "Routine name" })
        .props.onChangeText("My unsaved name");
      useHomeStore.setState({ devices: [{ ...device, isOn: true }] });
    });
    expect(
      tree.root.findByProps({ accessibilityLabel: "Routine name" }).props.value,
    ).toBe("My unsaved name");
  });

  it("preserves the draft while paging through focused routine chapters", () => {
    act(() => { tree = renderer.create(builder({ routineId: "rule:legacy" })); });
    act(() => tree.root.findByProps({ accessibilityLabel: "Routine name" }).props.onChangeText("Evening retreat"));
    press(tree, "Next routine sections");
    expect(tree.root.findAllByProps({ accessibilityLabel: "Routine name" })).toHaveLength(0);
    expect(tree.root.findByProps({ accessibilityLabel: "Add trigger" })).toBeTruthy();
    press(tree, "Do");
    expect(tree.root.findByProps({ accessibilityLabel: "Add action" })).toBeTruthy();
    press(tree, "Overview");
    expect(tree.root.findByProps({ accessibilityLabel: "Routine name" }).props.value).toBe("Evening retreat");
    press(tree, "Save routine");
    expect(selectRoutines(useHomeStore.getState()).find((routine) => routine.id === "rule:legacy")?.name).toBe("Evening retreat");
  });
  it.each([
    { accountUserId: "other-user" },
    { accountHomeId: "other-home" },
    { authenticatedUserId: "other-auth-user" },
    { activeHomeId: "other-home" },
    { activeMemberId: "other-member" },
    { sessionEpoch: seed.sessionEpoch + 1 },
  ])(
    "rejects a stale new-routine save after identity changes: %j",
    (change) => {
      act(() => {
        tree = renderer.create(
          builder({ deviceId: device.id, preset: "time" }),
        );
      });
      const staleSave = tree.root
        .findAllByType(Pressable)
        .find(
          (node: {
            props: { accessibilityLabel?: string; onPress: () => void };
          }) => node.props.accessibilityLabel === "Save routine",
        )!.props.onPress;
      act(() => {
        useHomeStore.setState(change);
      });
      act(() => {
        staleSave();
      });
      expect(selectRoutines(useHomeStore.getState())).toHaveLength(2);
      expect(goBack).not.toHaveBeenCalled();
      expect(
        tree.root.findByProps({ accessibilityLabel: "Save routine" }).props
          .disabled,
      ).toBe(true);
    },
  );

  it("latches a home change even when IDs return before the next render", () => {
    act(() => {
      tree = renderer.create(builder({ deviceId: device.id, preset: "time" }));
    });
    const staleSave = tree.root.findByProps({
      accessibilityLabel: "Save routine",
    }).props.onPress;
    act(() => {
      useHomeStore.setState({ activeHomeId: "other" });
      useHomeStore.setState({ activeHomeId: seed.activeHomeId });
    });
    act(() => {
      staleSave();
    });
    expect(selectRoutines(useHomeStore.getState())).toHaveLength(2);
    expect(goBack).not.toHaveBeenCalled();
  });

  it("rejects a confirmed deletion after a home change with a colliding routine ID", () => {
    act(() => {
      tree = renderer.create(builder({ routineId: "rule:legacy" }));
    });
    press(tree, "Delete routine");
    const staleDelete = tree.root.findByProps({
      accessibilityLabel: "Confirm delete routine",
    }).props.onPress;
    act(() => {
      useHomeStore.setState({
        activeHomeId: "another-home",
        rules: [{ ...rule, name: "Other home's evening" }],
      });
    });
    act(() => {
      staleDelete();
    });
    expect(useHomeStore.getState().rules[0].name).toBe("Other home's evening");
    expect(goBack).not.toHaveBeenCalled();
  });

  it("rechecks management permission when a previously allowed save callback runs", () => {
    act(() => {
      tree = renderer.create(builder({ routineId: "rule:legacy" }));
    });
    const staleSave = tree.root.findByProps({
      accessibilityLabel: "Save routine",
    }).props.onPress;
    act(() => {
      useHomeStore.setState({
        household: [
          { id: "test-owner", name: "Guest", role: "Guest", status: "home" },
        ],
        roomMembers: [{ memberId: "test-owner", roomIds: ["test-room"] }],
      });
    });
    act(() => {
      staleSave();
    });
    expect(useHomeStore.getState().rules).toEqual([rule]);
    expect(goBack).not.toHaveBeenCalled();
  });

  it("checks the draft's current device visibility before adding a new routine", () => {
    act(() => {
      tree = renderer.create(builder({ deviceId: device.id, preset: "time" }));
    });
    const staleSave = tree.root.findByProps({
      accessibilityLabel: "Save routine",
    }).props.onPress;
    act(() => {
      useHomeStore.setState({ devices: [] });
    });
    act(() => {
      staleSave();
    });
    expect(selectRoutines(useHomeStore.getState())).toHaveLength(2);
    expect(goBack).not.toHaveBeenCalled();
  });
});
