import React from "react";
import { Text, type TextProps } from "react-native";
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
  return (
    <MaskedView maskElement={<Text {...textProps}>{text}</Text>}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Invisible text to size the gradient correctly */}
        <Text {...textProps} style={[textProps.style, { opacity: 0 } as any]}>
          {text}
        </Text>
      </LinearGradient>
    </MaskedView>
  );
}
