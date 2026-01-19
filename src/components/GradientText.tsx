import React from "react";
import {
  Text,
  StyleSheet,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

export default function GradientText({
  text,
  colors,
  textProps,
}: {
  text: string;
  colors: readonly [string, string, ...string[]];
  textProps: TextProps;
}) {
  const hiddenTextStyle = (style?: StyleProp<TextStyle>): StyleProp<TextStyle> =>
    [style, styles.hiddenText];

  return (
    <MaskedView maskElement={<Text {...textProps}>{text}</Text>}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Invisible text to size the gradient correctly */}
        <Text {...textProps} style={hiddenTextStyle(textProps.style)}>
          {text}
        </Text>
      </LinearGradient>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  hiddenText: { opacity: 0 },
});
