import React, { type PropsWithChildren, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import CinematicSurface from "../CinematicSurface";
import Pressable from "../Pressable";
import { theme } from "../../theme/theme";

type IconName = keyof typeof Ionicons.glyphMap;
type ScreenProps = PropsWithChildren<{
  title: string;
  eyebrow?: string;
  subtitle?: string;
  onBack: () => void;
  actions?: ReactNode;
}>;

/** Give secondary destinations a consistent way home and a bounded, atmospheric workspace. */
export function DeepScreen({
  title,
  eyebrow = "YOUR HOME",
  subtitle,
  onBack,
  actions,
  children,
}: ScreenProps) {
  const { height } = useWindowDimensions();
  return (
    <SafeAreaView style={styles.safeArea}>
      <CinematicSurface style={styles.screen}>
        <View style={styles.masthead}>
          <Pressable
            accessibilityLabel="Go back"
            onPress={onBack}
            style={styles.back}
          >
            <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
          </Pressable>
          <View style={styles.identity}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={styles.title}
            >
              {title}
            </Text>
          </View>
          {actions && <View style={styles.headerActions}>{actions}</View>}
        </View>
        {subtitle && height >= 700 && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}
        <View style={styles.content}>{children}</View>
      </CinematicSurface>
    </SafeAreaView>
  );
}

export type DeepTab<T extends string = string> = {
  id: T;
  label: string;
  icon?: IconName;
};

/** Keep secondary categories within thumb reach; only the category strip can scroll horizontally. */
export function DeepTabs<T extends string>({
  items,
  selectedId,
  onSelect,
}: {
  items: readonly DeepTab<T>[];
  selectedId: T;
  onSelect: (id: T) => void;
}) {
  const { width } = useWindowDimensions();
  const showIcons = width >= 600 || items.length <= 3;
  return (
    <View style={styles.tabsWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={styles.tabs}
      >
        <View accessibilityRole="tablist" style={styles.tabList}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: selectedId === item.id }}
              aria-selected={selectedId === item.id}
              onPress={() => onSelect(item.id)}
              style={[styles.tab, selectedId === item.id && styles.selectedTab]}
            >
              {showIcons && item.icon && (
                <Ionicons
                  name={item.icon}
                  size={17}
                  color={
                    selectedId === item.id
                      ? theme.colors.accentText
                      : theme.colors.subtext
                  }
                />
              )}
              <Text
                style={[
                  styles.tabLabel,
                  selectedId === item.id && styles.selectedTabLabel,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** Reuse one translucent surface rather than nesting ornamental frames inside cards. */
export function DeepCard({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Present an accessible touch action with one clear visual priority. */
export function DeepAction({
  label,
  onPress,
  icon,
  primary = false,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  primary?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.action,
        primary && styles.primaryAction,
        disabled && styles.disabled,
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={18}
          color={primary ? theme.colors.bg0 : theme.colors.accentText}
        />
      )}
      <Text style={[styles.actionLabel, primary && styles.primaryActionLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Page through complete cards while retaining fixed navigation at the bottom of a workspace. */
export function DeepPager({
  page,
  pageCount,
  onChange,
  label = "pages",
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  label?: string;
}) {
  const count = Math.max(1, pageCount);
  const current = Math.max(0, Math.min(page, count - 1));
  return (
    <View style={styles.pager}>
      <Pressable
        accessibilityLabel={`Previous ${label}`}
        accessibilityState={{ disabled: current === 0 }}
        disabled={current === 0}
        onPress={() => onChange(current - 1)}
        style={[styles.pagerButton, current === 0 && styles.disabled]}
      >
        <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={styles.pageLabel}>
        {current + 1} <Text style={styles.pageTotal}>/ {count}</Text>
      </Text>
      <Pressable
        accessibilityLabel={`Next ${label}`}
        accessibilityState={{ disabled: current === count - 1 }}
        disabled={current === count - 1}
        onPress={() => onChange(current + 1)}
        style={[styles.pagerButton, current === count - 1 && styles.disabled]}
      >
        <Ionicons name="arrow-forward" size={20} color={theme.colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.bg0 },
  screen: { flex: 1, minHeight: 0 },
  masthead: {
    minHeight: 78,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.stroke,
  },
  back: {
    width: 44,
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: theme.colors.card2,
    alignItems: "center",
    justifyContent: "center",
  },
  identity: { flex: 1, minWidth: 0, gap: 5 },
  eyebrow: {
    color: theme.colors.accentText,
    fontSize: 9,
    letterSpacing: 1.7,
    fontWeight: "600",
  },
  title: {
    color: theme.colors.text,
    fontSize: 25,
    fontWeight: "500",
    letterSpacing: -0.8,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  subtitle: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 18,
    marginHorizontal: 20,
    marginTop: 14,
  },
  content: {
    flex: 1,
    minHeight: 0,
    padding: 16,
    gap: 12,
    width: "100%",
    maxWidth: 1200,
    alignSelf: "center",
  },
  tabsWrap: { flexShrink: 0, minHeight: 48 },
  tabs: { flexGrow: 1 },
  tabList: { flexDirection: "row", alignItems: "center", gap: 6, flexGrow: 1 },
  tab: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "transparent",
    flexGrow: 1,
  },
  selectedTab: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.stroke,
  },
  tabLabel: { color: theme.colors.subtext, fontSize: 12, fontWeight: "500" },
  selectedTabLabel: { color: theme.colors.accentText, fontWeight: "600" },
  card: {
    padding: 18,
    gap: 12,
    borderRadius: 26,
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  action: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: theme.colors.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryAction: { backgroundColor: theme.colors.accent },
  actionLabel: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
  primaryActionLabel: { color: theme.colors.bg0 },
  disabled: { opacity: 0.35 },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 4,
  },
  pagerButton: {
    width: 46,
    minHeight: 46,
    borderRadius: 17,
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  pageLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  pageTotal: { color: theme.colors.subtext },
});
