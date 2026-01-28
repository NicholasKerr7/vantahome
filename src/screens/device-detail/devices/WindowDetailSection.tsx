import React from "react";
import { View, Text } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Slider from "@react-native-community/slider";
import AnimatedLottieView from "lottie-react-native";
import type { Device } from "../../../store/useHomeStore";
import Pressable from "../../../components/Pressable";

type WindowDetailSectionProps = {
  device: Device;
  isLandscapeSplit: boolean;
  isWindowTabletPortrait: boolean;
  isOpen: boolean;
  openDisplayValue: number;
  openPercent: number;
  openStatusText: string;
  windowFlowLabel: string;
  windowFlowHint: string;
  windowHeroCardStyle: StyleProp<ViewStyle>;
  windowHeroHeaderStyle: StyleProp<ViewStyle>;
  windowHeroTitleWrapStyle: StyleProp<ViewStyle>;
  windowHeroTitleStyle: StyleProp<TextStyle>;
  windowHeroSubStyle: StyleProp<TextStyle>;
  windowHeroPillStyle: (active: boolean) => StyleProp<ViewStyle>;
  windowHeroPillTextStyle: (active: boolean) => StyleProp<TextStyle>;
  windowHeroBodyStyle: StyleProp<ViewStyle>;
  windowHeroOrbStyle: (active: boolean) => StyleProp<ViewStyle>;
  windowHeroOrbGlowStyle: StyleProp<ViewStyle>;
  windowHeroLottieStyle: StyleProp<ViewStyle>;
  windowHeroControlsStyle: StyleProp<ViewStyle>;
  windowHeroMeterRowStyle: StyleProp<ViewStyle>;
  windowHeroMeterLabelStyle: StyleProp<TextStyle>;
  windowHeroMeterValueStyle: StyleProp<TextStyle>;
  windowHeroSliderWrapStyle: StyleProp<ViewStyle>;
  windowHeroTrackStyle: StyleProp<ViewStyle>;
  windowHeroTrackFillStyle: StyleProp<ViewStyle>;
  windowHeroSliderStyle: StyleProp<ViewStyle>;
  windowHeroHintStyle: StyleProp<TextStyle>;
  windowQuickSetWrapStyle: StyleProp<ViewStyle>;
  windowQuickSetHeaderStyle: StyleProp<ViewStyle>;
  windowQuickSetLabelStyle: StyleProp<TextStyle>;
  windowQuickSetRowStyle: StyleProp<ViewStyle>;
  windowQuickSetButtonStyle: (active: boolean) => StyleProp<ViewStyle>;
  windowQuickSetTextStyle: (active: boolean) => StyleProp<TextStyle>;
  windowQuickSetIconSize: number;
  quickSetIconColor: string;
  quickSetIconActiveColor: string;
  pillIconColor: string;
  pillIconActiveColor: string;
  showQuickSetCard: boolean;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  windowQuickSetCard?: React.ReactNode;
  controlCardStyle: StyleProp<ViewStyle>;
  cardLabelStyle: StyleProp<TextStyle>;
  onSetOpenPercent: (value: number) => void;
  onQuickSet: (value: number) => void;
  windowLottieSource: React.ComponentProps<typeof AnimatedLottieView>["source"];
};

export default function WindowDetailSection({
  device,
  isLandscapeSplit,
  isWindowTabletPortrait,
  isOpen,
  openDisplayValue,
  openPercent,
  windowFlowLabel,
  windowFlowHint,
  openStatusText,
  windowHeroCardStyle,
  windowHeroHeaderStyle,
  windowHeroTitleWrapStyle,
  windowHeroTitleStyle,
  windowHeroSubStyle,
  windowHeroPillStyle,
  windowHeroPillTextStyle,
  windowHeroBodyStyle,
  windowHeroOrbStyle,
  windowHeroOrbGlowStyle,
  windowHeroLottieStyle,
  windowHeroControlsStyle,
  windowHeroMeterRowStyle,
  windowHeroMeterLabelStyle,
  windowHeroMeterValueStyle,
  windowHeroSliderWrapStyle,
  windowHeroTrackStyle,
  windowHeroTrackFillStyle,
  windowHeroSliderStyle,
  windowHeroHintStyle,
  windowQuickSetWrapStyle,
  windowQuickSetHeaderStyle,
  windowQuickSetLabelStyle,
  windowQuickSetRowStyle,
  windowQuickSetButtonStyle,
  windowQuickSetTextStyle,
  windowQuickSetIconSize,
  quickSetIconColor,
  quickSetIconActiveColor,
  pillIconColor,
  pillIconActiveColor,
  showQuickSetCard,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  windowQuickSetCard,
  controlCardStyle,
  cardLabelStyle,
  onSetOpenPercent,
  onQuickSet,
  windowLottieSource,
}: WindowDetailSectionProps) {
  const heroCard = (
    <LinearGradient
      colors={[
        "rgba(255,255,255,0.95)",
        "rgba(226,236,255,0.9)",
        "rgba(214,224,255,0.86)",
      ]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={windowHeroCardStyle}
    >
      <View style={windowHeroHeaderStyle}>
        <View style={windowHeroTitleWrapStyle}>
          <Text style={windowHeroTitleStyle}>{device.name}</Text>
          <Text style={windowHeroSubStyle}>{openStatusText}</Text>
        </View>
        <View style={windowHeroPillStyle(openDisplayValue > 0)}>
          <Ionicons
            name={openDisplayValue > 0 ? "leaf" : "lock-closed"}
            size={14}
            color={openDisplayValue > 0 ? pillIconActiveColor : pillIconColor}
          />
          <Text style={windowHeroPillTextStyle(openDisplayValue > 0)}>
            {windowFlowLabel}
          </Text>
        </View>
      </View>
      <View style={windowHeroBodyStyle}>
        <View style={windowHeroOrbStyle(isOpen)}>
          <LinearGradient
            colors={[
              "rgba(122,92,255,0.24)",
              "rgba(180,107,255,0.18)",
              "rgba(255,255,255,0.9)",
            ]}
            start={{ x: 0.2, y: 0.1 }}
            end={{ x: 1, y: 1 }}
            style={windowHeroOrbGlowStyle}
          />
          <AnimatedLottieView
            source={windowLottieSource}
            progress={openPercent / 100}
            autoPlay={false}
            loop={false}
            resizeMode="contain"
            style={windowHeroLottieStyle}
          />
        </View>
        <View style={windowHeroControlsStyle}>
          <View style={windowHeroMeterRowStyle}>
            <Text style={windowHeroMeterLabelStyle}>Ventilation</Text>
            <Text style={windowHeroMeterValueStyle}>{openDisplayValue}%</Text>
          </View>
          <View style={windowHeroSliderWrapStyle}>
            <View style={windowHeroTrackStyle}>
              <View style={windowHeroTrackFillStyle} />
            </View>
            <Slider
              value={openDisplayValue}
              minimumValue={0}
              maximumValue={100}
              step={1}
              onSlidingComplete={(value) =>
                onSetOpenPercent(Math.round(value))
              }
              minimumTrackTintColor="transparent"
              maximumTrackTintColor="transparent"
              thumbTintColor="rgba(255,255,255,0.92)"
              style={windowHeroSliderStyle}
            />
          </View>
          <Text style={windowHeroHintStyle}>{windowFlowHint}</Text>
          {isWindowTabletPortrait ? (
            <View style={windowQuickSetWrapStyle}>
              <View style={windowQuickSetHeaderStyle}>
                <Ionicons name="flash" size={14} color={quickSetIconColor} />
                <Text style={windowQuickSetLabelStyle}>Quick set</Text>
              </View>
              <View style={windowQuickSetRowStyle}>
                {[
                  { label: "Open", value: 100, icon: "arrow-up-circle" },
                  { label: "Vent", value: 25, icon: "leaf" },
                  { label: "Close", value: 0, icon: "lock-closed" },
                ].map((preset) => {
                  const active = openPercent === preset.value;
                  return (
                    <Pressable
                      key={preset.label}
                      style={windowQuickSetButtonStyle(active)}
                      onPress={() => onQuickSet(preset.value)}
                    >
                      <Ionicons
                        name={preset.icon as any}
                        size={windowQuickSetIconSize}
                        color={
                          active ? quickSetIconActiveColor : quickSetIconColor
                        }
                      />
                      <Text style={windowQuickSetTextStyle(active)}>
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </LinearGradient>
  );

  const quickSetCard =
    windowQuickSetCard ??
    (showQuickSetCard ? (
      <View style={controlCardStyle}>
        <Text style={cardLabelStyle}>Quick set</Text>
        <View style={windowQuickSetRowStyle}>
          {[
            { label: "Open", value: 100, icon: "arrow-up-circle" },
            { label: "Vent", value: 25, icon: "leaf" },
            { label: "Close", value: 0, icon: "lock-closed" },
          ].map((preset) => {
            const active = openPercent === preset.value;
            return (
              <Pressable
                key={preset.label}
                style={windowQuickSetButtonStyle(active)}
                onPress={() => onQuickSet(preset.value)}
              >
                <Ionicons
                  name={preset.icon as any}
                  size={windowQuickSetIconSize}
                  color={active ? quickSetIconActiveColor : quickSetIconColor}
                />
                <Text style={windowQuickSetTextStyle(active)}>
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    ) : null);

  if (isLandscapeSplit) {
    return (
      <View style={landscapeGridStyle}>
        <View style={landscapeColumnPrimaryStyle}>{heroCard}</View>
        <View style={landscapeColumnSecondaryStyle}>{quickSetCard}</View>
      </View>
    );
  }

  return (
    <>
      {heroCard}
      {quickSetCard}
    </>
  );
}
