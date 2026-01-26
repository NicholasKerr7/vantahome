import React from "react";
import { View, Text } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import Slider from "@react-native-community/slider";
import Pressable from "../../../components/Pressable";
import type { Device } from "../../../store/useHomeStore";
import OptionChips from "../../../components/OptionChips";

type SpeakerDetailSectionProps = {
  isLandscapeSplit: boolean;
  usePortraitGrid: boolean;
  portraitGridStyle: StyleProp<ViewStyle>;
  portraitCardStyle: StyleProp<ViewStyle>;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  styles: Record<string, any>;
  speakerHeroCard: React.ReactNode;
  controlCardStyle: StyleProp<ViewStyle>;
  controlCardRowTightStyle: StyleProp<ViewStyle>;
  chipStyle: (active: boolean) => StyleProp<ViewStyle>;
  chipTextStyle: (active: boolean) => StyleProp<TextStyle>;
  controlPillStyle: (active: boolean) => StyleProp<ViewStyle>;
  controlPillTextStyle: (active: boolean) => StyleProp<TextStyle>;
  speakerSource: string;
  speakerPreset: string;
  speakerBassDraft: number;
  speakerTrebleDraft: number;
  speakerSpatial: boolean;
  speakerParty: boolean;
  speakerNight: boolean;
  speakerShuffle: boolean;
  speakerMic: boolean;
  speakerAssistant: boolean;
  speakerRepeat: string;
  onPatch: (patch: Partial<Device>) => void;
  onChangeBassDraft: (value: number) => void;
  onChangeTrebleDraft: (value: number) => void;
};

export default function SpeakerDetailSection({
  isLandscapeSplit,
  usePortraitGrid,
  portraitGridStyle,
  portraitCardStyle,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  styles,
  speakerHeroCard,
  controlCardStyle,
  controlCardRowTightStyle,
  chipStyle,
  chipTextStyle,
  controlPillStyle,
  controlPillTextStyle,
  speakerSource,
  speakerPreset,
  speakerBassDraft,
  speakerTrebleDraft,
  speakerSpatial,
  speakerParty,
  speakerNight,
  speakerShuffle,
  speakerMic,
  speakerAssistant,
  speakerRepeat,
  onPatch,
  onChangeBassDraft,
  onChangeTrebleDraft,
}: SpeakerDetailSectionProps) {
  const cardStyle = usePortraitGrid
    ? [controlCardStyle, portraitCardStyle]
    : controlCardStyle;
  const controlCards = (
    <>
      <View style={cardStyle}>
        <Text style={styles.cardLabel}>Source</Text>
        <OptionChips
          options={["Spotify", "AirPlay", "Bluetooth", "AUX", "TV"].map(
            (value) => ({
              value,
              label: value,
            }),
          )}
          value={speakerSource}
          onSelect={(value) =>
            onPatch({
              speakerSource: value as Device["speakerSource"],
            })
          }
          rowStyle={styles.chipRow}
          chipStyle={chipStyle}
          chipTextStyle={chipTextStyle}
        />
      </View>

      <View style={cardStyle}>
        <Text style={styles.cardLabel}>EQ Preset</Text>
        <OptionChips
          options={["Flat", "Warm", "Bright", "Bass", "Vocal"].map((value) => ({
            value,
            label: value,
          }))}
          value={speakerPreset}
          onSelect={(value) =>
            onPatch({
              speakerPreset: value as Device["speakerPreset"],
            })
          }
          rowStyle={styles.chipRow}
          chipStyle={chipStyle}
          chipTextStyle={chipTextStyle}
        />

        <View style={styles.speakerSliderRow}>
          <Text style={styles.speakerSliderLabel}>Bass</Text>
          <Text style={styles.speakerSliderValue}>{speakerBassDraft}%</Text>
        </View>
        <Slider
          value={speakerBassDraft}
          minimumValue={0}
          maximumValue={100}
          step={1}
          onValueChange={(value) => onChangeBassDraft(Math.round(value))}
          onSlidingComplete={(value) => onPatch({ bass: Math.round(value) })}
          minimumTrackTintColor="rgba(122,92,255,0.9)"
          maximumTrackTintColor="rgba(12,12,18,0.12)"
          thumbTintColor="rgba(255,255,255,0.92)"
          style={styles.speakerSlider}
        />

        <View style={styles.speakerSliderRow}>
          <Text style={styles.speakerSliderLabel}>Treble</Text>
          <Text style={styles.speakerSliderValue}>{speakerTrebleDraft}%</Text>
        </View>
        <Slider
          value={speakerTrebleDraft}
          minimumValue={0}
          maximumValue={100}
          step={1}
          onValueChange={(value) => onChangeTrebleDraft(Math.round(value))}
          onSlidingComplete={(value) => onPatch({ treble: Math.round(value) })}
          minimumTrackTintColor="rgba(122,92,255,0.9)"
          maximumTrackTintColor="rgba(12,12,18,0.12)"
          thumbTintColor="rgba(255,255,255,0.92)"
          style={styles.speakerSlider}
        />
      </View>

      <View style={cardStyle}>
        <Text style={styles.cardLabel}>Smart modes</Text>
        <View style={styles.chipRow}>
          {[
            { label: "Spatial", field: "spatialAudio" },
            { label: "Party", field: "partyMode" },
            { label: "Night", field: "nightMode" },
            { label: "Shuffle", field: "shuffle" },
          ].map((item) => {
            const active =
              item.field === "spatialAudio"
                ? speakerSpatial
                : item.field === "partyMode"
                  ? speakerParty
                  : item.field === "nightMode"
                    ? speakerNight
                    : speakerShuffle;
            return (
              <Pressable
                key={item.label}
                style={chipStyle(active)}
                onPress={() =>
                  onPatch({
                    [item.field]: !active,
                  } as Partial<Device>)
                }
              >
                <Text style={chipTextStyle(active)}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={controlCardRowTightStyle}>
          <Pressable
            style={controlPillStyle(speakerMic)}
            onPress={() => onPatch({ micEnabled: !speakerMic })}
          >
            <Text style={controlPillTextStyle(speakerMic)}>
              {speakerMic ? "Mic On" : "Mic Off"}
            </Text>
          </Pressable>
          <Pressable
            style={controlPillStyle(speakerAssistant)}
            onPress={() =>
              onPatch({
                voiceAssistantEnabled: !speakerAssistant,
              })
            }
          >
            <Text style={controlPillTextStyle(speakerAssistant)}>
              {speakerAssistant ? "Assistant" : "Assistant Off"}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.cardHint}>Repeat</Text>
        <OptionChips
          options={[
            { label: "Off", value: "off" },
            { label: "All", value: "all" },
            { label: "One", value: "one" },
          ]}
          value={speakerRepeat}
          onSelect={(value) =>
            onPatch({
              repeat: value as Device["repeat"],
            })
          }
          rowStyle={styles.chipRow}
          chipStyle={chipStyle}
          chipTextStyle={chipTextStyle}
        />
      </View>
    </>
  );

  if (usePortraitGrid && !isLandscapeSplit) {
    return (
      <>
        {speakerHeroCard}
        <View style={portraitGridStyle}>{controlCards}</View>
      </>
    );
  }

  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>{speakerHeroCard}</View>
      <View style={landscapeColumnSecondaryStyle}>{controlCards}</View>
    </View>
  ) : (
    <>
      {speakerHeroCard}
      {controlCards}
    </>
  );
}
