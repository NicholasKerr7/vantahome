import {
  FlatList,
  Platform,
  ScrollView,
  SectionList,
  VirtualizedList,
} from "react-native";

type DefaultPropsTarget = {
  defaultProps?: Record<string, unknown>;
};

const sharedScrollDefaults: Record<string, unknown> = {
  showsVerticalScrollIndicator: false,
  showsHorizontalScrollIndicator: false,
  ...(Platform.OS !== "web" ? { nestedScrollEnabled: true } : {}),
  ...(Platform.OS === "android" ? { overScrollMode: "never" } : {}),
};

function applyDefaultProps(
  component: DefaultPropsTarget,
  defaults: Record<string, unknown>,
) {
  component.defaultProps = {
    ...(component.defaultProps ?? {}),
    ...defaults,
  };
}

let hasConfiguredScrollBehavior = false;

export default function configureScrollBehavior() {
  if (hasConfiguredScrollBehavior) return;
  hasConfiguredScrollBehavior = true;

  applyDefaultProps(
    ScrollView as unknown as DefaultPropsTarget,
    sharedScrollDefaults,
  );
  applyDefaultProps(
    FlatList as unknown as DefaultPropsTarget,
    sharedScrollDefaults,
  );
  applyDefaultProps(
    SectionList as unknown as DefaultPropsTarget,
    sharedScrollDefaults,
  );
  applyDefaultProps(
    VirtualizedList as unknown as DefaultPropsTarget,
    sharedScrollDefaults,
  );
}
