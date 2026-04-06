import React from "react";
import { View } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import Pressable from "./Pressable";
import ButtonLabel from "./ButtonLabel";

type Option<T extends string | number> = {
  label: string;
  value: T;
};

type OptionChipsProps<T extends string | number> = {
  options: Array<Option<T>>;
  value: T;
  onSelect: (value: T) => void;
  rowStyle: StyleProp<ViewStyle>;
  chipStyle: (active: boolean) => StyleProp<ViewStyle>;
  chipTextStyle: (active: boolean) => StyleProp<TextStyle>;
  isActive?: (option: Option<T>) => boolean;
};

export default function OptionChips<T extends string | number>({
  options,
  value,
  onSelect,
  rowStyle,
  chipStyle,
  chipTextStyle,
  isActive,
}: OptionChipsProps<T>) {
  return (
    <View style={rowStyle}>
      {options.map((option) => {
        const active = isActive ? isActive(option) : value === option.value;
        return (
          <Pressable
            key={`${option.label}-${option.value}`}
            style={chipStyle(active)}
            onPress={() => onSelect(option.value)}
          >
            <ButtonLabel style={chipTextStyle(active)}>
              {option.label}
            </ButtonLabel>
          </Pressable>
        );
      })}
    </View>
  );
}
