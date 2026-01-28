import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import type { StyleProp, ViewStyle, TextStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";

type Props = {
  uri?: string;
  title?: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
};

function CameraThumbnail({
  uri,
  title,
  subtitle,
  style,
  titleStyle,
  subtitleStyle,
}: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(uri) && !failed;
  const gradientColors = useMemo(
    () =>
      [
        "rgba(255,255,255,0.08)",
        "rgba(255,255,255,0.04)",
        "rgba(0,0,0,0.1)",
      ] as const,
    [],
  );

  return (
    <View style={[styles.root, style]}>
      {showImage ? (
        <Image
          source={{ uri: uri as string }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          onError={() => setFailed(true)}
        />
      ) : (
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={styles.overlay}>
        <Ionicons
          name="videocam"
          size={18}
          color="rgba(255,255,255,0.9)"
        />
        {title ? <Text style={[styles.title, titleStyle]}>{title}</Text> : null}
        {subtitle ? (
          <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}

export default React.memo(CameraThumbnail);

const styles = StyleSheet.create({
  root: {
    width: "100%",
    height: "100%",
    borderRadius: 16,
    overflow: "hidden",
  },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(10,10,14,0.18)",
  },
  title: {
    color: theme.colors.text,
    fontWeight: "800",
  },
  subtitle: {
    color: theme.colors.subtext,
    fontWeight: "700",
  },
});
