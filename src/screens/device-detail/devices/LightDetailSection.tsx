import React from "react";
import { Animated, Text, View } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import Pressable from "../../../components/Pressable";
import RadialDial from "../../../components/RadialDial";
import OptionChips from "../../../components/OptionChips";
import type { Device } from "../../../store/useHomeStore";

type LightScene = {
  label: string;
  color: string;
  brightness: number;
  icon: keyof typeof Ionicons.glyphMap;
};

type LightEffect = {
  label: string;
  value: NonNullable<Device["lightEffect"]>;
  icon: keyof typeof Ionicons.glyphMap;
};

type LightTempPreset = { label: string; value: number };

type LightDetailSectionProps = {
  device: Device;
  roomName: string;
  theme: { colors: { accent: string; accent2: string } };
  styles: Record<string, any>;
  stylesVars: { ink: string; subtext: string };
  lightLayoutStyle: StyleProp<ViewStyle>;
  lightDialColumnStyle: StyleProp<ViewStyle>;
  lightHeroGradient: [string, string, string];
  lightHeroCardStyle: StyleProp<ViewStyle>;
  utilityHeroPillStyle: (active: boolean) => StyleProp<ViewStyle>;
  utilityHeroPillTextStyle: (active: boolean) => StyleProp<TextStyle>;
  lightHeroBodyStyle: StyleProp<ViewStyle>;
  lightDialWrapStyle: StyleProp<ViewStyle>;
  lightDialSize: number;
  brightness: number;
  lightCenterOrbStyle: StyleProp<ViewStyle>;
  lightCenterInnerStyle: StyleProp<ViewStyle>;
  bulbGradient: [string, string];
  lightCenterIcon: number;
  bulbIconColor: string;
  lightCenterValueStyle: StyleProp<TextStyle>;
  lightCenterRoomStyle: StyleProp<TextStyle>;
  lightHeroInfoStackStyle: StyleProp<ViewStyle>;
  lightHeroMetaCardStyle: StyleProp<ViewStyle>;
  lightHeroMetaTitleStyle: StyleProp<TextStyle>;
  lightColorRowStyle: StyleProp<ViewStyle>;
  lightSwatches: string[];
  lightSwatchStyleFor: (color: string, active: boolean) => StyleProp<ViewStyle>;
  lightSceneOptions: LightScene[];
  lightSceneColor: string;
  lightScenesUseTiles: boolean;
  lightSceneActionRowStyle: StyleProp<ViewStyle>;
  lightSceneRowStyle: StyleProp<ViewStyle>;
  lightModeTileStyle: (active: boolean) => StyleProp<ViewStyle>;
  lightSceneCardStyle: StyleProp<ViewStyle>;
  lightSceneIconSize: number;
  lightSceneIconWrapStyle: StyleProp<ViewStyle>;
  lightSceneTextStyle: StyleProp<TextStyle>;
  modeTextStyle: (active: boolean) => StyleProp<TextStyle>;
  lightControlsColumnLayoutStyle: StyleProp<ViewStyle>;
  isTablet: boolean;
  lightControlCardStyle: StyleProp<ViewStyle>;
  lightCardHintStyle: StyleProp<TextStyle>;
  colorTempK: number;
  lightTempPresets: LightTempPreset[];
  chipStyle: (active: boolean) => StyleProp<ViewStyle>;
  chipTextStyle: (active: boolean) => StyleProp<TextStyle>;
  lightCardHintTopStyle: StyleProp<TextStyle>;
  lightEffectsUseTiles: boolean;
  lightEffectActionRowStyle: StyleProp<ViewStyle>;
  lightEffects: LightEffect[];
  lightEffect: Device["lightEffect"];
  modeTileStyle: (active: boolean) => StyleProp<ViewStyle>;
  chipRowTopStyle: StyleProp<ViewStyle>;
  chipRowItemStyle: (active: boolean) => StyleProp<ViewStyle>;
  lightControlsCompact: boolean;
  lightControlsGridStyle: StyleProp<ViewStyle>;
  lightControlCompactStyle: StyleProp<ViewStyle>;
  adaptiveLighting: boolean;
  motionBoost: boolean;
  nightShift: boolean;
  autoOffMin: number;
  lightAutoOffOptions: number[];
  onPatch: (patch: Partial<Device>) => void;
  onAnimateBulb: () => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export default function LightDetailSection({
  device,
  roomName,
  theme,
  styles,
  stylesVars,
  lightLayoutStyle,
  lightDialColumnStyle,
  lightHeroGradient,
  lightHeroCardStyle,
  utilityHeroPillStyle,
  utilityHeroPillTextStyle,
  lightHeroBodyStyle,
  lightDialWrapStyle,
  lightDialSize,
  brightness,
  lightCenterOrbStyle,
  lightCenterInnerStyle,
  bulbGradient,
  lightCenterIcon,
  bulbIconColor,
  lightCenterValueStyle,
  lightCenterRoomStyle,
  lightHeroInfoStackStyle,
  lightHeroMetaCardStyle,
  lightHeroMetaTitleStyle,
  lightColorRowStyle,
  lightSwatches,
  lightSwatchStyleFor,
  lightSceneOptions,
  lightSceneColor,
  lightScenesUseTiles,
  lightSceneActionRowStyle,
  lightSceneRowStyle,
  lightModeTileStyle,
  lightSceneCardStyle,
  lightSceneIconSize,
  lightSceneIconWrapStyle,
  lightSceneTextStyle,
  modeTextStyle,
  lightControlsColumnLayoutStyle,
  isTablet,
  lightControlCardStyle,
  lightCardHintStyle,
  colorTempK,
  lightTempPresets,
  chipStyle,
  chipTextStyle,
  lightCardHintTopStyle,
  lightEffectsUseTiles,
  lightEffectActionRowStyle,
  lightEffects,
  lightEffect,
  modeTileStyle,
  chipRowTopStyle,
  chipRowItemStyle,
  lightControlsCompact,
  lightControlsGridStyle,
  lightControlCompactStyle,
  adaptiveLighting,
  motionBoost,
  nightShift,
  autoOffMin,
  lightAutoOffOptions,
  onPatch,
  onAnimateBulb,
}: LightDetailSectionProps) {
  const temperatureOptions = lightTempPresets.map((preset) => ({
    label: preset.label,
    value: preset.value,
  }));
  const autoOffOptions = lightAutoOffOptions.map((minutes) => ({
    label: minutes === 0 ? "Off" : `${minutes}m`,
    value: minutes,
  }));

  return (
    <View style={lightLayoutStyle}>
      <View style={lightDialColumnStyle}>
        <LinearGradient
          colors={lightHeroGradient}
          start={{ x: 0.1, y: 0.05 }}
          end={{ x: 1, y: 1 }}
          style={lightHeroCardStyle}
        >
          <View style={styles.utilityHeroHeader}>
            <View style={styles.utilityHeroTitleWrap}>
              <Text style={styles.utilityHeroTitle}>{device.name}</Text>
              <Text style={styles.utilityHeroSub}>{roomName || "Light"}</Text>
            </View>
            <View style={styles.utilityHeroPillRow}>
              <View style={utilityHeroPillStyle(device.isOn)}>
                <Ionicons
                  name={device.isOn ? "bulb" : "bulb-outline"}
                  size={14}
                  color={
                    device.isOn ? theme.colors.accent2 : stylesVars.subtext
                  }
                />
                <Text style={utilityHeroPillTextStyle(device.isOn)}>
                  {device.isOn ? "On" : "Off"}
                </Text>
              </View>
            </View>
          </View>
          <View style={lightHeroBodyStyle}>
            <View style={lightDialWrapStyle}>
              <RadialDial
                size={lightDialSize}
                value={brightness}
                min={0}
                max={100}
                tickValues={[0, 25, 50, 75, 100]}
                centerContent={
                  <Animated.View style={lightCenterOrbStyle}>
                    <LinearGradient
                      colors={bulbGradient}
                      start={{ x: 0.2, y: 0.1 }}
                      end={{ x: 0.9, y: 1 }}
                      style={lightCenterInnerStyle}
                    >
                      <Ionicons
                        name="bulb"
                        size={lightCenterIcon}
                        color={bulbIconColor}
                      />
                      <Text style={lightCenterValueStyle}>
                        {device.brightness ?? 60}%
                      </Text>
                      <Text style={lightCenterRoomStyle}>
                        {roomName || "Light"}
                      </Text>
                    </LinearGradient>
                  </Animated.View>
                }
                formatTick={(v) => `${v}`}
                formatValue={(v) => `${v}%`}
                formatCenterValue={(v) => `${v}%`}
                dimmed={!device.isOn}
                onChange={(v) => {
                  onAnimateBulb();
                  onPatch({
                    brightness: clamp(v, 0, 100),
                    lightEffect: undefined,
                    isOn: v > 0,
                  });
                }}
              />
            </View>
            <View style={lightHeroInfoStackStyle}>
              <View style={lightHeroMetaCardStyle}>
                <Text style={lightHeroMetaTitleStyle}>Color</Text>
                <View style={lightColorRowStyle}>
                  {lightSwatches.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() =>
                        onPatch({
                          color: c,
                          lightEffect: undefined,
                          isOn: true,
                        })
                      }
                      style={lightSwatchStyleFor(c, device.color === c)}
                    />
                  ))}
                </View>
              </View>

              <View style={lightHeroMetaCardStyle}>
                <Text style={lightHeroMetaTitleStyle}>Scenes</Text>
                <View
                  style={
                    lightScenesUseTiles
                      ? lightSceneActionRowStyle
                      : lightSceneRowStyle
                  }
                >
                  {lightSceneOptions.map((scene) => {
                    const active =
                      lightSceneColor === scene.color.toLowerCase() &&
                      Math.abs(brightness - scene.brightness) <= 2;
                    return (
                      <Pressable
                        key={scene.label}
                        style={
                          lightScenesUseTiles
                            ? lightModeTileStyle(active)
                            : lightSceneCardStyle
                        }
                        onPress={() => {
                          onAnimateBulb();
                          onPatch({
                            brightness: scene.brightness,
                            color: scene.color,
                            lightEffect: undefined,
                            isOn: true,
                          });
                        }}
                      >
                        {lightScenesUseTiles ? (
                          active ? (
                            <LinearGradient
                              colors={[
                                theme.colors.accent2,
                                theme.colors.accent,
                              ]}
                              start={{ x: 0.1, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.modeIconBubbleActive}
                            >
                              <Ionicons
                                name={scene.icon}
                                size={lightSceneIconSize}
                                color="#FFFFFF"
                              />
                            </LinearGradient>
                          ) : (
                            <View style={styles.modeIconBubble}>
                              <Ionicons
                                name={scene.icon}
                                size={lightSceneIconSize}
                                color="rgba(12,12,18,0.65)"
                              />
                            </View>
                          )
                        ) : (
                          <View style={lightSceneIconWrapStyle}>
                            <Ionicons
                              name={scene.icon}
                              size={lightSceneIconSize}
                              color={stylesVars.ink}
                            />
                          </View>
                        )}
                        <Text
                          style={
                            lightScenesUseTiles
                              ? modeTextStyle(active)
                              : lightSceneTextStyle
                          }
                        >
                          {scene.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={lightControlsColumnLayoutStyle}>
        {isTablet ? (
          <>
            <View style={lightControlCardStyle}>
              <Text style={styles.cardLabel}>Temperature</Text>
              <Text style={lightCardHintStyle}>{colorTempK}K</Text>
              <OptionChips
                options={temperatureOptions}
                value={colorTempK}
                isActive={(option) => Math.abs(colorTempK - option.value) <= 200}
                onSelect={(value) =>
                  onPatch({
                    colorTempK: value,
                    lightEffect: undefined,
                    isOn: true,
                  })
                }
                rowStyle={styles.chipRow}
                chipStyle={chipStyle}
                chipTextStyle={chipTextStyle}
              />

              <Text style={lightCardHintTopStyle}>Effects</Text>
              {lightEffectsUseTiles ? (
                <View style={lightEffectActionRowStyle}>
                  {lightEffects.map((effect) => {
                    const active = lightEffect === effect.value;
                    return (
                      <Pressable
                        key={effect.value}
                        style={modeTileStyle(active)}
                        onPress={() =>
                          onPatch({
                            lightEffect: effect.value,
                            isOn: true,
                          })
                        }
                      >
                        {active ? (
                          <LinearGradient
                            colors={[
                              theme.colors.accent2,
                              theme.colors.accent,
                            ]}
                            start={{ x: 0.1, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.modeIconBubbleActive}
                          >
                            <Ionicons
                              name={effect.icon}
                              size={lightSceneIconSize}
                              color="#FFFFFF"
                            />
                          </LinearGradient>
                        ) : (
                          <View style={styles.modeIconBubble}>
                            <Ionicons
                              name={effect.icon}
                              size={lightSceneIconSize}
                              color="rgba(12,12,18,0.65)"
                            />
                          </View>
                        )}
                        <Text style={modeTextStyle(active)}>
                          {effect.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={chipRowTopStyle}>
                  {lightEffects.map((effect) => {
                    const active = lightEffect === effect.value;
                    return (
                      <Pressable
                        key={effect.value}
                        style={chipRowItemStyle(active)}
                        onPress={() =>
                          onPatch({
                            lightEffect: effect.value,
                            isOn: true,
                          })
                        }
                      >
                        <Ionicons
                          name={effect.icon}
                          size={lightSceneIconSize}
                          color={active ? stylesVars.ink : stylesVars.subtext}
                        />
                        <Text style={chipTextStyle(active)}>
                          {effect.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={lightControlCardStyle}>
              <Text style={styles.cardLabel}>Automation</Text>
              <View style={styles.chipRow}>
                <Pressable
                  style={chipStyle(adaptiveLighting)}
                  onPress={() =>
                    onPatch({ adaptiveLighting: !adaptiveLighting })
                  }
                >
                  <Text style={chipTextStyle(adaptiveLighting)}>Adaptive</Text>
                </Pressable>
                <Pressable
                  style={chipStyle(motionBoost)}
                  onPress={() => onPatch({ motionBoost: !motionBoost })}
                >
                  <Text style={chipTextStyle(motionBoost)}>Motion</Text>
                </Pressable>
                <Pressable
                  style={chipStyle(nightShift)}
                  onPress={() => onPatch({ nightShift: !nightShift })}
                >
                  <Text style={chipTextStyle(nightShift)}>Night Shift</Text>
                </Pressable>
              </View>

              <Text style={lightCardHintTopStyle}>Auto-off</Text>
              <OptionChips
                options={autoOffOptions}
                value={autoOffMin}
                onSelect={(value) => onPatch({ autoOffMin: value })}
                rowStyle={chipRowTopStyle}
                chipStyle={chipStyle}
                chipTextStyle={chipTextStyle}
              />
            </View>
          </>
        ) : lightControlsCompact ? (
          <View style={lightControlsGridStyle}>
            <View style={lightControlCompactStyle}>
              <View style={styles.lightControlHeaderRow}>
                <Text style={styles.cardLabel}>Temperature</Text>
                <Text style={lightCardHintStyle}>{colorTempK}K</Text>
              </View>
              <OptionChips
                options={temperatureOptions}
                value={colorTempK}
                isActive={(option) => Math.abs(colorTempK - option.value) <= 200}
                onSelect={(value) =>
                  onPatch({
                    colorTempK: value,
                    lightEffect: undefined,
                    isOn: true,
                  })
                }
                rowStyle={styles.chipRow}
                chipStyle={chipStyle}
                chipTextStyle={chipTextStyle}
              />

              <Text style={lightCardHintTopStyle}>Effects</Text>
              {lightEffectsUseTiles ? (
                <View style={lightEffectActionRowStyle}>
                  {lightEffects.map((effect) => {
                    const active = lightEffect === effect.value;
                    return (
                      <Pressable
                        key={effect.value}
                        style={modeTileStyle(active)}
                        onPress={() =>
                          onPatch({ lightEffect: effect.value, isOn: true })
                        }
                      >
                        {active ? (
                          <LinearGradient
                            colors={[
                              theme.colors.accent2,
                              theme.colors.accent,
                            ]}
                            start={{ x: 0.1, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.modeIconBubbleActive}
                          >
                            <Ionicons
                              name={effect.icon}
                              size={lightSceneIconSize}
                              color="#FFFFFF"
                            />
                          </LinearGradient>
                        ) : (
                          <View style={styles.modeIconBubble}>
                            <Ionicons
                              name={effect.icon}
                              size={lightSceneIconSize}
                              color="rgba(12,12,18,0.65)"
                            />
                          </View>
                        )}
                        <Text style={modeTextStyle(active)}>
                          {effect.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={chipRowTopStyle}>
                  {lightEffects.map((effect) => {
                    const active = lightEffect === effect.value;
                    return (
                      <Pressable
                        key={effect.value}
                        style={chipRowItemStyle(active)}
                        onPress={() =>
                          onPatch({ lightEffect: effect.value, isOn: true })
                        }
                      >
                        <Ionicons
                          name={effect.icon}
                          size={lightSceneIconSize}
                          color={active ? stylesVars.ink : stylesVars.subtext}
                        />
                        <Text style={chipTextStyle(active)}>
                          {effect.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={lightControlCompactStyle}>
              <Text style={styles.cardLabel}>Automation</Text>
              <View style={styles.chipRow}>
                <Pressable
                  style={chipStyle(adaptiveLighting)}
                  onPress={() =>
                    onPatch({ adaptiveLighting: !adaptiveLighting })
                  }
                >
                  <Text style={chipTextStyle(adaptiveLighting)}>Adaptive</Text>
                </Pressable>
                <Pressable
                  style={chipStyle(motionBoost)}
                  onPress={() => onPatch({ motionBoost: !motionBoost })}
                >
                  <Text style={chipTextStyle(motionBoost)}>Motion</Text>
                </Pressable>
                <Pressable
                  style={chipStyle(nightShift)}
                  onPress={() => onPatch({ nightShift: !nightShift })}
                >
                  <Text style={chipTextStyle(nightShift)}>Night Shift</Text>
                </Pressable>
              </View>

              <Text style={lightCardHintTopStyle}>Auto-off</Text>
              <OptionChips
                options={autoOffOptions}
                value={autoOffMin}
                onSelect={(value) => onPatch({ autoOffMin: value })}
                rowStyle={chipRowTopStyle}
                chipStyle={chipStyle}
                chipTextStyle={chipTextStyle}
              />
            </View>
          </View>
        ) : (
          <View style={lightControlCardStyle}>
            <Text style={styles.cardLabel}>Temperature</Text>
            <Text style={lightCardHintStyle}>{colorTempK}K</Text>
            <OptionChips
              options={temperatureOptions}
              value={colorTempK}
              isActive={(option) => Math.abs(colorTempK - option.value) <= 200}
              onSelect={(value) =>
                onPatch({
                  colorTempK: value,
                  lightEffect: undefined,
                  isOn: true,
                })
              }
              rowStyle={styles.chipRow}
              chipStyle={chipStyle}
              chipTextStyle={chipTextStyle}
            />

            <Text style={lightCardHintTopStyle}>Effects</Text>
            {lightEffectsUseTiles ? (
              <View style={lightEffectActionRowStyle}>
                {lightEffects.map((effect) => {
                  const active = lightEffect === effect.value;
                  return (
                    <Pressable
                      key={effect.value}
                      style={modeTileStyle(active)}
                      onPress={() =>
                        onPatch({ lightEffect: effect.value, isOn: true })
                      }
                    >
                      {active ? (
                        <LinearGradient
                          colors={[
                            theme.colors.accent2,
                            theme.colors.accent,
                          ]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modeIconBubbleActive}
                        >
                          <Ionicons
                            name={effect.icon}
                            size={lightSceneIconSize}
                            color="#FFFFFF"
                          />
                        </LinearGradient>
                      ) : (
                        <View style={styles.modeIconBubble}>
                          <Ionicons
                            name={effect.icon}
                            size={lightSceneIconSize}
                            color="rgba(12,12,18,0.65)"
                          />
                        </View>
                      )}
                      <Text style={modeTextStyle(active)}>{effect.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={chipRowTopStyle}>
                {lightEffects.map((effect) => {
                  const active = lightEffect === effect.value;
                  return (
                    <Pressable
                      key={effect.value}
                      style={chipRowItemStyle(active)}
                      onPress={() =>
                        onPatch({ lightEffect: effect.value, isOn: true })
                      }
                    >
                      <Ionicons
                        name={effect.icon}
                        size={lightSceneIconSize}
                        color={active ? stylesVars.ink : stylesVars.subtext}
                      />
                      <Text style={chipTextStyle(active)}>
                        {effect.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text style={lightCardHintTopStyle}>Automation</Text>
            <View style={styles.chipRow}>
              <Pressable
                style={chipStyle(adaptiveLighting)}
                onPress={() =>
                  onPatch({ adaptiveLighting: !adaptiveLighting })
                }
              >
                <Text style={chipTextStyle(adaptiveLighting)}>Adaptive</Text>
              </Pressable>
              <Pressable
                style={chipStyle(motionBoost)}
                onPress={() => onPatch({ motionBoost: !motionBoost })}
              >
                <Text style={chipTextStyle(motionBoost)}>Motion</Text>
              </Pressable>
              <Pressable
                style={chipStyle(nightShift)}
                onPress={() => onPatch({ nightShift: !nightShift })}
              >
                <Text style={chipTextStyle(nightShift)}>Night Shift</Text>
              </Pressable>
            </View>

            <Text style={lightCardHintTopStyle}>Auto-off</Text>
            <OptionChips
              options={autoOffOptions}
              value={autoOffMin}
              onSelect={(value) => onPatch({ autoOffMin: value })}
              rowStyle={chipRowTopStyle}
              chipStyle={chipStyle}
              chipTextStyle={chipTextStyle}
            />
          </View>
        )}
      </View>
    </View>
  );
}
