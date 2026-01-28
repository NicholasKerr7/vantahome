import React, { type PropsWithChildren } from "react";
import {
  ScrollView,
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type ScreenSectionLayoutProps = PropsWithChildren<{
  header: React.ReactNode;
  headerWrapStyle?: StyleProp<ViewStyle>;
  showDivider?: boolean;
  dividerWrapStyle?: StyleProp<ViewStyle>;
  dividerStyle?: StyleProp<ViewStyle>;
  scrollStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  showsVerticalScrollIndicator?: boolean;
}>;

function ScreenSectionLayout({
  header,
  headerWrapStyle,
  showDivider = false,
  dividerWrapStyle,
  dividerStyle,
  scrollStyle,
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
  children,
}: ScreenSectionLayoutProps) {
  const headerStyle = headerWrapStyle ?? styles.headerWrap;
  const dividerWrap = dividerWrapStyle ?? styles.dividerWrap;
  const dividerLine = dividerStyle ?? styles.divider;

  return (
    <>
      <View style={headerStyle}>{header}</View>
      {showDivider ? (
        <View style={dividerWrap}>
          <View style={dividerLine} />
        </View>
      ) : null}
      <ScrollView
        style={scrollStyle}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      >
        {children}
      </ScrollView>
    </>
  );
}

export default React.memo(ScreenSectionLayout);

const styles = StyleSheet.create({
  headerWrap: { width: "100%" },
  dividerWrap: { width: "100%" },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
});
