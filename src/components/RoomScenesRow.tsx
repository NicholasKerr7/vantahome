import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Pressable from "./Pressable";
import ModalCard from "./ModalCard";
import ModalForm, { useModalViewportStyle } from "./ModalForm";
import { DeepAction } from "./deep/DeepScreen";
import { theme } from "../theme/theme";
import { useHomeStore, type Scene } from "../store/useHomeStore";
import { useResponsive } from "../theme/layout";
import { runtimePolicy } from "../config/runtimeMode";
import CinematicCardArtwork from "../features/cinematic-artwork/CinematicCardArtwork";
import { sceneArtwork } from "../features/cinematic-artwork/artwork";

type Props = {
  title?: string;
  scenes: Array<Pick<Scene, "id" | "name" | "modelPreset">>;
  onRun: (sceneId: string) => void;
  horizontalInset?: number;
};

/** Keep scenes in a single quiet action strip above the room's device cards. */
export default function RoomScenesRow({
  title = "Scenes",
  scenes,
  onRun,
  horizontalInset,
}: Props) {
  const activeSceneId = useHomeStore((state) => state.activeSceneId);
  const { gutter } = useResponsive();
  const inset = horizontalInset ?? gutter;
  const insetStyle = useMemo(
    () => StyleSheet.create({ strip: { marginHorizontal: inset } }).strip,
    [inset],
  );
  const modalViewportStyle = useModalViewportStyle();
  const [showInfo, setShowInfo] = useState(false);
  if (!scenes.length) return null;
  return (
    <View style={[styles.strip, insetStyle]}>
      <Text style={styles.heading}>{title}</Text>
      <ScrollView
        horizontal
        style={styles.choices}
        contentContainerStyle={styles.choiceContent}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        {scenes.map((scene) => (
          <Pressable
            key={scene.id}
            accessibilityLabel={`Run ${scene.name} scene`}
            accessibilityState={{ selected: scene.id === activeSceneId }}
            onPress={() => onRun(scene.id)}
            style={[
              styles.choice,
              scene.id === activeSceneId && styles.selected,
            ]}
          >
            <CinematicCardArtwork artwork={sceneArtwork(scene)} />
            <Ionicons
              name="sparkles-outline"
              size={15}
              color={theme.colors.accentText}
            />
            <Text style={styles.choiceText}>{scene.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        accessibilityLabel="About room scenes"
        onPress={() => setShowInfo(true)}
        style={styles.infoButton}
      >
        <Ionicons
          name="information-circle-outline"
          size={21}
          color={theme.colors.subtext}
        />
      </Pressable>
      {showInfo && (
        <ModalCard
          visible
          onRequestClose={() => setShowInfo(false)}
          onBackdropPress={() => setShowInfo(false)}
          backdropAccessibilityLabel="Close scene information"
          animationType="none"
          colors={[theme.colors.glass, theme.colors.bg0]}
          cardStyle={[styles.infoCard, modalViewportStyle]}
        >
          <ModalForm
            footer={
              <DeepAction
                label="Got it"
                primary
                onPress={() => setShowInfo(false)}
              />
            }
          >
            <View style={styles.infoContent}>
              <Text accessibilityRole="header" style={styles.infoTitle}>
                One touch, a different mood.
              </Text>
              <Text style={styles.infoText}>
                {runtimePolicy.requireRealTransport
                  ? "Tap a scene to request its settings. Devices update after their state is observed. Undo requests the previous settings."
                  : "Tap a scene to apply its settings to the room. You can undo for a few seconds after it runs."}
              </Text>
            </View>
          </ModalForm>
        </ModalCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexShrink: 0,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  heading: { color: theme.colors.subtext, fontSize: 11, fontWeight: "500" },
  choices: { flex: 1, minWidth: 0 },
  choiceContent: { gap: 8, alignItems: "center" },
  choice: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.card2,
    overflow: "hidden",
  },
  selected: {
    backgroundColor: theme.colors.bg1,
    borderColor: theme.colors.accent,
  },
  choiceText: {
    color: theme.colors.accentText,
    fontSize: 12,
    fontWeight: "500",
  },
  infoButton: {
    minHeight: 44,
    width: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
  },
  infoCard: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    padding: 22,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  infoContent: { gap: 12 },
  infoTitle: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 29,
    fontWeight: "500",
  },
  infoText: { color: theme.colors.subtext, fontSize: 14, lineHeight: 22 },
});
