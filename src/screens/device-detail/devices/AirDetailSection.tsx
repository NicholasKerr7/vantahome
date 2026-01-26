import React from "react";
import { View, Text } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import Slider from "@react-native-community/slider";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import Pressable from "../../../components/Pressable";
import type { Device } from "../../../store/useHomeStore";
import OptionChips from "../../../components/OptionChips";

type AirBand = {
  label: string;
  color: string;
};

type AirDetailSectionProps = {
  isLandscapeSplit: boolean;
  isTabletPortrait: boolean;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  styles: Record<string, any>;
  stylesVars: { ink: string; subtext: string };
  airHeroCardStyle: StyleProp<ViewStyle>;
  airHeroGlowStyle: StyleProp<ViewStyle>;
  airHeroBadgeStyle: StyleProp<ViewStyle>;
  airHeroBadgeDotStyle: StyleProp<ViewStyle>;
  airHeroBadgeTextStyle: StyleProp<TextStyle>;
  airHeroBodyStyle: StyleProp<ViewStyle>;
  airHeroScoreStyle: StyleProp<ViewStyle>;
  airHeroLabelStyle: StyleProp<TextStyle>;
  airHeroValueStyle: StyleProp<TextStyle>;
  airHeroGaugeRingStyle: StyleProp<ViewStyle>;
  airHeroGaugeValueStyle: StyleProp<TextStyle>;
  airHeroGaugeLabelStyle: StyleProp<TextStyle>;
  airTrendCardStyle: StyleProp<ViewStyle>;
  airTrendPillStyle: StyleProp<ViewStyle>;
  airChartBarStyle: (
    height: number,
    color: string,
    opacity: number,
  ) => StyleProp<ViewStyle>;
  airChartMaxHeight: number;
  airLegendDotStyle: (color: string) => StyleProp<ViewStyle>;
  airLegendBands: AirBand[];
  airMetricCardStyle: StyleProp<ViewStyle>;
  airSurfaceCardStyle: StyleProp<ViewStyle>;
  airSensorRowStyle: (active: boolean) => StyleProp<ViewStyle>;
  airSensorDotStyle: (color: string) => StyleProp<ViewStyle>;
  chipStyle: (active: boolean) => StyleProp<ViewStyle>;
  chipTextStyle: (active: boolean) => StyleProp<TextStyle>;
  controlPillStyle: (active: boolean) => StyleProp<ViewStyle>;
  controlPillTextStyle: (active: boolean) => StyleProp<TextStyle>;
  controlCardRowTopStyle: StyleProp<ViewStyle>;
  flex1Style: StyleProp<ViewStyle>;
  formatMetric: (
    value: number | null | undefined,
    unit?: string,
    digits?: number,
  ) => string;
  formatTimeAgo: (ts: number) => string;
  resolveAirBand: (aqi: number) => AirBand;
  roomLabel: string;
  airBand: AirBand;
  airQuality: number;
  humidity: number;
  deviceTempC?: number;
  roomTemp: number;
  airConfidence: number;
  airLastUpdatedAt: number | null;
  airTrendIcon: keyof typeof Ionicons.glyphMap;
  airTrendLabel: string;
  airSeriesAqi: number[];
  airChartMax: number;
  airRecommendations: string[];
  airCo2: number;
  airPm25: number;
  airPm10: number;
  airVoc: number;
  airFormaldehyde: number;
  airPollen: number;
  airFilterLife: number;
  airFilterDaysLeft: number;
  airPurifierMode: NonNullable<Device["airPurifierMode"]>;
  airPurifierSpeed: number;
  airIonizerEnabled: boolean;
  airAutoVentilation: boolean;
  airAlertsEnabled: boolean;
  airAlertAqi: number;
  airAlertCo2: number;
  airAlertPm25: number;
  airAlertPm10: number;
  airAlertVoc: number;
  airAlertPollen: number;
  airOutdoorAqi: number;
  airOutdoorCo2: number;
  airOutdoorPm25: number;
  airOutdoorHumidity: number;
  airOutdoorTempC: number;
  airSensors: Device[];
  activeSensorId: string;
  roomLookup: Map<string, string>;
  onSelectSensor: (id: string) => void;
  onPatch: (patch: Partial<Device>) => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export default function AirDetailSection({
  isLandscapeSplit,
  isTabletPortrait,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  styles,
  stylesVars,
  airHeroCardStyle,
  airHeroGlowStyle,
  airHeroBadgeStyle,
  airHeroBadgeDotStyle,
  airHeroBadgeTextStyle,
  airHeroBodyStyle,
  airHeroScoreStyle,
  airHeroLabelStyle,
  airHeroValueStyle,
  airHeroGaugeRingStyle,
  airHeroGaugeValueStyle,
  airHeroGaugeLabelStyle,
  airTrendCardStyle,
  airTrendPillStyle,
  airChartBarStyle,
  airChartMaxHeight,
  airLegendDotStyle,
  airLegendBands,
  airMetricCardStyle,
  airSurfaceCardStyle,
  airSensorRowStyle,
  airSensorDotStyle,
  chipStyle,
  chipTextStyle,
  controlPillStyle,
  controlPillTextStyle,
  controlCardRowTopStyle,
  flex1Style,
  formatMetric,
  formatTimeAgo,
  resolveAirBand,
  roomLabel,
  airBand,
  airQuality,
  humidity,
  deviceTempC,
  roomTemp,
  airConfidence,
  airLastUpdatedAt,
  airTrendIcon,
  airTrendLabel,
  airSeriesAqi,
  airChartMax,
  airRecommendations,
  airCo2,
  airPm25,
  airPm10,
  airVoc,
  airFormaldehyde,
  airPollen,
  airFilterLife,
  airFilterDaysLeft,
  airPurifierMode,
  airPurifierSpeed,
  airIonizerEnabled,
  airAutoVentilation,
  airAlertsEnabled,
  airAlertAqi,
  airAlertCo2,
  airAlertPm25,
  airAlertPm10,
  airAlertVoc,
  airAlertPollen,
  airOutdoorAqi,
  airOutdoorCo2,
  airOutdoorPm25,
  airOutdoorHumidity,
  airOutdoorTempC,
  airSensors,
  activeSensorId,
  roomLookup,
  onSelectSensor,
  onPatch,
}: AirDetailSectionProps) {
  const renderAirAlertSlider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    valueText: string,
    onChange: (value: number) => void,
  ) => {
    const pct = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
    const trackFillStyle: StyleProp<ViewStyle> = [
      styles.airAlertTrackFill,
      { width: `${Math.round(pct * 100)}%` },
    ];
    return (
      <View style={styles.airAlertSliderBlock}>
        <View style={styles.airAlertSliderRow}>
          <Text style={styles.airAlertSliderLabel}>{label}</Text>
          <Text style={styles.airAlertSliderValue}>{valueText}</Text>
        </View>
        <View style={styles.airAlertSliderWrap}>
          <View style={styles.airAlertTrack}>
            <View style={trackFillStyle} />
          </View>
          <Slider
            value={value}
            minimumValue={min}
            maximumValue={max}
            step={step}
            onSlidingComplete={onChange}
            minimumTrackTintColor="transparent"
            maximumTrackTintColor="transparent"
            thumbTintColor="rgba(255,255,255,0.92)"
            style={styles.airAlertSlider}
          />
        </View>
      </View>
    );
  };

  const heroCard = (
    <LinearGradient
      colors={[
        "rgba(255,255,255,0.98)",
        "rgba(236,242,255,0.92)",
        "rgba(222,230,255,0.88)",
      ]}
      start={{ x: 0.05, y: 0.05 }}
      end={{ x: 1, y: 1 }}
      style={airHeroCardStyle}
    >
      <View style={airHeroGlowStyle} pointerEvents="none" />
      <View style={styles.airHeroHeader}>
        <View>
          <Text style={styles.airHeroTitle}>Air Quality</Text>
          <Text style={styles.airHeroSub}>{`${roomLabel} Sensor`}</Text>
        </View>
        <View style={airHeroBadgeStyle}>
          <View style={airHeroBadgeDotStyle} />
          <Text style={airHeroBadgeTextStyle}>{airBand.label}</Text>
        </View>
      </View>
      <View style={airHeroBodyStyle}>
        <View style={airHeroScoreStyle}>
          <Text style={airHeroLabelStyle}>AQI</Text>
          <Text style={airHeroValueStyle}>
            {airQuality > 0 ? airQuality : "--"}
          </Text>
          <Text style={styles.airHeroDescriptor}>{airBand.label}</Text>
          <View style={styles.airHeroMetaRow}>
            <View style={styles.airHeroMetaPill}>
              <Ionicons name="water" size={12} color={stylesVars.subtext} />
              <Text style={styles.airHeroMetaText}>
                {formatMetric(humidity, "%")}
              </Text>
            </View>
            <View style={styles.airHeroMetaPill}>
              <Ionicons
                name="thermometer"
                size={12}
                color={stylesVars.subtext}
              />
              <Text style={styles.airHeroMetaText}>
                {formatMetric(
                  typeof deviceTempC === "number" ? deviceTempC : roomTemp,
                  "C",
                  1,
                )}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.airHeroGaugeWrap}>
          <View style={airHeroGaugeRingStyle}>
            <LinearGradient
              colors={[airBand.color, "rgba(255,255,255,0.92)"]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.airHeroGaugeInner}
            >
              <Ionicons name="leaf" size={24} color="#fff" />
              <Text style={airHeroGaugeValueStyle}>{airConfidence}%</Text>
              <Text style={airHeroGaugeLabelStyle}>Confidence</Text>
            </LinearGradient>
          </View>
          <Text style={styles.airHeroUpdated}>
            Updated{" "}
            {airLastUpdatedAt ? formatTimeAgo(airLastUpdatedAt) : "just now"}
          </Text>
        </View>
      </View>
      <View style={styles.airHeroMetricRow}>
        {[
          { label: "CO2", value: formatMetric(airCo2, "ppm") },
          { label: "PM2.5", value: formatMetric(airPm25, "ug/m3") },
          { label: "VOC", value: formatMetric(airVoc, "ppb") },
        ].map((metric) => (
          <View key={`air-hero-${metric.label}`} style={styles.airHeroMetric}>
            <Text style={styles.airHeroMetricValue}>{metric.value}</Text>
            <Text style={styles.airHeroMetricLabel}>{metric.label}</Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );

  const detailCards = (
    <>
      <View style={airSurfaceCardStyle}>
        <Text style={styles.cardLabel}>Purifier</Text>
        <OptionChips
          options={["auto", "manual", "sleep", "boost"].map((mode) => ({
            value: mode,
            label:
              mode === "auto"
                ? "Auto"
                : mode === "manual"
                  ? "Manual"
                  : mode === "sleep"
                    ? "Sleep"
                    : "Boost",
          }))}
          value={airPurifierMode}
          onSelect={(mode) =>
            onPatch({
              airPurifierMode: mode as Device["airPurifierMode"],
              isOn: true,
            })
          }
          rowStyle={styles.chipRow}
          chipStyle={chipStyle}
          chipTextStyle={chipTextStyle}
        />
        <View style={styles.pressureSliderRow}>
          <Text style={styles.pressureSliderLabel}>Fan</Text>
          <Text style={styles.pressureSliderValue}>{airPurifierSpeed}%</Text>
        </View>
        <Slider
          value={airPurifierSpeed}
          minimumValue={0}
          maximumValue={100}
          step={1}
          onSlidingComplete={(value) =>
            onPatch({ airPurifierSpeed: Math.round(value), isOn: true })
          }
          minimumTrackTintColor="rgba(122,92,255,0.9)"
          maximumTrackTintColor="rgba(12,12,18,0.12)"
          thumbTintColor="rgba(255,255,255,0.92)"
          style={styles.pressureSlider}
        />
        <View style={controlCardRowTopStyle}>
          <Pressable
            style={controlPillStyle(airIonizerEnabled)}
            onPress={() => onPatch({ airIonizerEnabled: !airIonizerEnabled })}
          >
            <Text style={controlPillTextStyle(airIonizerEnabled)}>
              {airIonizerEnabled ? "Ionizer" : "Ionizer Off"}
            </Text>
          </Pressable>
          <Pressable
            style={controlPillStyle(airAutoVentilation)}
            onPress={() =>
              onPatch({ airAutoVentilation: !airAutoVentilation })
            }
          >
            <Text style={controlPillTextStyle(airAutoVentilation)}>
              {airAutoVentilation ? "Auto Vent" : "Vent Off"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={airTrendCardStyle}>
        <View style={styles.airTrendHeader}>
          <Text style={styles.cardLabel}>24h trend</Text>
          <View style={airTrendPillStyle}>
            <Ionicons name={airTrendIcon} size={14} color={airBand.color} />
            <Text style={styles.airTrendText}>{airTrendLabel}</Text>
          </View>
        </View>
        <View style={styles.airTrendChartFrame}>
          <View style={styles.airChart}>
            {airSeriesAqi.map((value, index) => {
              const height = Math.max(
                6,
                Math.round((value / airChartMax) * airChartMaxHeight),
              );
              const band = resolveAirBand(value);
              return (
                <View
                  key={`air-bar-${index}`}
                  style={airChartBarStyle(
                    height,
                    band.color,
                    index === airSeriesAqi.length - 1 ? 1 : 0.6,
                  )}
                />
              );
            })}
          </View>
        </View>
        <View style={styles.airLegendRow}>
          {airLegendBands.map((band) => (
            <View key={`air-legend-${band.label}`} style={styles.airLegendItem}>
              <View style={airLegendDotStyle(band.color)} />
              <Text style={styles.airLegendText}>{band.label}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.airTrendUpdated}>
          Updated{" "}
          {airLastUpdatedAt ? formatTimeAgo(airLastUpdatedAt) : "just now"}
        </Text>
      </View>

      <View style={styles.airMetricGrid}>
        {[
          { label: "PM2.5", value: formatMetric(airPm25, "ug/m3") },
          { label: "PM10", value: formatMetric(airPm10, "ug/m3") },
          { label: "CO2", value: formatMetric(airCo2, "ppm") },
          { label: "VOC", value: formatMetric(airVoc, "ppb") },
          { label: "HCHO", value: formatMetric(airFormaldehyde, "mg/m3", 2) },
          { label: "Pollen", value: formatMetric(airPollen, "idx", 1) },
          {
            label: "Temp",
            value: formatMetric(
              typeof deviceTempC === "number" ? deviceTempC : roomTemp,
              "C",
              1,
            ),
          },
          { label: "Humidity", value: formatMetric(humidity, "%") },
          { label: "AQI", value: airQuality > 0 ? `${airQuality}` : "--" },
        ].map((metric) => (
          <View key={`air-metric-${metric.label}`} style={airMetricCardStyle}>
            <Text style={styles.airMetricValue}>{metric.value}</Text>
            <Text style={styles.airMetricLabel}>{metric.label}</Text>
          </View>
        ))}
      </View>

    </>
  );

  const detailCardsRight = (
    <>
      <View style={airSurfaceCardStyle}>
        <Text style={styles.cardLabel}>Recommendations</Text>
        {airRecommendations.map((item, index) => (
          <View key={`air-rec-${index}`} style={styles.airRecommendationRow}>
            <Ionicons name="sparkles" size={14} color={stylesVars.ink} />
            <Text style={styles.airRecommendationText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.airKpiRow}>
        <View style={styles.airKpiCard}>
          <Text style={styles.airKpiValue}>{airFilterLife}%</Text>
          <Text style={styles.airKpiLabel}>Filter life</Text>
        </View>
        <View style={styles.airKpiCard}>
          <Text style={styles.airKpiValue}>{airFilterDaysLeft} days</Text>
          <Text style={styles.airKpiLabel}>Replace in</Text>
        </View>
      </View>

      {airFilterLife <= 20 && (
        <View style={styles.airAlertCard}>
          <Ionicons name="warning" size={14} color="#D8465B" />
          <Text style={styles.airAlertText}>Replace filter soon</Text>
        </View>
      )}

      <View style={styles.airCompareRow}>
        <View style={styles.airCompareCard}>
          <Text style={styles.airCompareTitle}>Indoor</Text>
          <Text style={styles.airCompareValue}>
            AQI {airQuality > 0 ? airQuality : "--"}
          </Text>
          <Text style={styles.airCompareSub}>
            CO2 {formatMetric(airCo2, "ppm")}
          </Text>
          <Text style={styles.airCompareSub}>
            PM2.5 {formatMetric(airPm25, "ug/m3")}
          </Text>
          <Text style={styles.airCompareSub}>
            Humidity {formatMetric(humidity, "%")}
          </Text>
          <Text style={styles.airCompareSub}>
            Temp{" "}
            {formatMetric(
              typeof deviceTempC === "number" ? deviceTempC : roomTemp,
              "C",
              1,
            )}
          </Text>
        </View>
        <View style={styles.airCompareCard}>
          <Text style={styles.airCompareTitle}>Outdoor</Text>
          <Text style={styles.airCompareValue}>
            AQI {airOutdoorAqi > 0 ? airOutdoorAqi : "--"}
          </Text>
          <Text style={styles.airCompareSub}>
            CO2 {formatMetric(airOutdoorCo2, "ppm")}
          </Text>
          <Text style={styles.airCompareSub}>
            PM2.5 {formatMetric(airOutdoorPm25, "ug/m3")}
          </Text>
          <Text style={styles.airCompareSub}>
            Humidity {formatMetric(airOutdoorHumidity, "%")}
          </Text>
          <Text style={styles.airCompareSub}>
            Temp {formatMetric(airOutdoorTempC, "C", 1)}
          </Text>
        </View>
      </View>

      <View style={airSurfaceCardStyle}>
        <Text style={styles.cardLabel}>Alerts</Text>
        <View style={controlCardRowTopStyle}>
          <Pressable
            style={controlPillStyle(airAlertsEnabled)}
            onPress={() => onPatch({ airAlertsEnabled: !airAlertsEnabled })}
          >
            <Text style={controlPillTextStyle(airAlertsEnabled)}>
              {airAlertsEnabled ? "Alerts on" : "Alerts off"}
            </Text>
          </Pressable>
        </View>
        {renderAirAlertSlider(
          "AQI",
          airAlertAqi,
          50,
          200,
          1,
          `${airAlertAqi}`,
          (value) => onPatch({ airAlertAqi: Math.round(value) }),
        )}
        {renderAirAlertSlider(
          "CO2",
          airAlertCo2,
          600,
          2000,
          10,
          `${airAlertCo2} ppm`,
          (value) => onPatch({ airAlertCo2: Math.round(value) }),
        )}
        {renderAirAlertSlider(
          "PM2.5",
          airAlertPm25,
          10,
          120,
          1,
          `${airAlertPm25} ug/m3`,
          (value) => onPatch({ airAlertPm25: Math.round(value) }),
        )}
        {renderAirAlertSlider(
          "PM10",
          airAlertPm10,
          20,
          160,
          1,
          `${airAlertPm10} ug/m3`,
          (value) => onPatch({ airAlertPm10: Math.round(value) }),
        )}
        {renderAirAlertSlider(
          "VOC",
          airAlertVoc,
          80,
          800,
          10,
          `${airAlertVoc} ppb`,
          (value) => onPatch({ airAlertVoc: Math.round(value) }),
        )}
        {renderAirAlertSlider(
          "Pollen",
          airAlertPollen,
          1,
          5,
          1,
          `${airAlertPollen} idx`,
          (value) => onPatch({ airAlertPollen: Math.round(value) }),
        )}
      </View>

      <View style={airSurfaceCardStyle}>
        <Text style={styles.cardLabel}>Sensor map</Text>
        {airSensors.length === 0 ? (
          <Text style={styles.scheduleEmpty}>No air sensors yet</Text>
        ) : (
          <View style={styles.airSensorList}>
            {airSensors.map((sensor) => {
              const isActive = sensor.id === activeSensorId;
              const sensorBand = resolveAirBand(sensor.airQualityIndex ?? 0);
              return (
                <Pressable
                  key={sensor.id}
                  style={airSensorRowStyle(isActive)}
                  onPress={() => onSelectSensor(sensor.id)}
                >
                  <View style={airSensorDotStyle(sensorBand.color)} />
                  <View style={flex1Style}>
                    <Text style={styles.airSensorName}>{sensor.name}</Text>
                    <Text style={styles.airSensorSub}>
                      {roomLookup.get(sensor.roomId) ?? ""}
                    </Text>
                  </View>
                  <Text style={styles.airSensorValue}>
                    AQI {sensor.airQualityIndex ? sensor.airQualityIndex : "--"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </>
  );

  const tabletPortraitGrid = (
    <View
      style={{
        flexDirection: "row",
        gap: 12,
        alignItems: "flex-start",
        marginTop: 14,
      }}
    >
      <View style={{ flex: 1, gap: 12 }}>
        <View style={airSurfaceCardStyle}>
          <Text style={styles.cardLabel}>Purifier</Text>
          <OptionChips
            options={["auto", "manual", "sleep", "boost"].map((mode) => ({
              value: mode,
              label:
                mode === "auto"
                  ? "Auto"
                  : mode === "manual"
                    ? "Manual"
                    : mode === "sleep"
                      ? "Sleep"
                      : "Boost",
            }))}
            value={airPurifierMode}
            onSelect={(mode) =>
              onPatch({
                airPurifierMode: mode as Device["airPurifierMode"],
                isOn: true,
              })
            }
            rowStyle={styles.chipRow}
            chipStyle={chipStyle}
            chipTextStyle={chipTextStyle}
          />
          <View style={styles.pressureSliderRow}>
            <Text style={styles.pressureSliderLabel}>Fan</Text>
            <Text style={styles.pressureSliderValue}>{airPurifierSpeed}%</Text>
          </View>
          <Slider
            value={airPurifierSpeed}
            minimumValue={0}
            maximumValue={100}
            step={1}
            onSlidingComplete={(value) =>
              onPatch({ airPurifierSpeed: Math.round(value), isOn: true })
            }
            minimumTrackTintColor="rgba(122,92,255,0.9)"
            maximumTrackTintColor="rgba(12,12,18,0.12)"
            thumbTintColor="rgba(255,255,255,0.92)"
            style={styles.pressureSlider}
          />
          <View style={controlCardRowTopStyle}>
            <Pressable
              style={controlPillStyle(airIonizerEnabled)}
              onPress={() => onPatch({ airIonizerEnabled: !airIonizerEnabled })}
            >
              <Text style={controlPillTextStyle(airIonizerEnabled)}>
                {airIonizerEnabled ? "Ionizer" : "Ionizer Off"}
              </Text>
            </Pressable>
            <Pressable
              style={controlPillStyle(airAutoVentilation)}
              onPress={() =>
                onPatch({ airAutoVentilation: !airAutoVentilation })
              }
            >
              <Text style={controlPillTextStyle(airAutoVentilation)}>
                {airAutoVentilation ? "Auto Vent" : "Vent Off"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={airTrendCardStyle}>
          <View style={styles.airTrendHeader}>
            <Text style={styles.cardLabel}>24h trend</Text>
            <View style={airTrendPillStyle}>
              <Ionicons name={airTrendIcon} size={14} color={airBand.color} />
              <Text style={styles.airTrendText}>{airTrendLabel}</Text>
            </View>
          </View>
          <View style={styles.airTrendChartFrame}>
            <View style={styles.airChart}>
              {airSeriesAqi.map((value, index) => {
                const height = Math.max(
                  6,
                  Math.round((value / airChartMax) * airChartMaxHeight),
                );
                const band = resolveAirBand(value);
                return (
                  <View
                    key={`air-bar-${index}`}
                    style={airChartBarStyle(
                      height,
                      band.color,
                      index === airSeriesAqi.length - 1 ? 1 : 0.6,
                    )}
                  />
                );
              })}
            </View>
          </View>
          <View style={styles.airLegendRow}>
            {airLegendBands.map((band) => (
              <View
                key={`air-legend-${band.label}`}
                style={styles.airLegendItem}
              >
                <View style={airLegendDotStyle(band.color)} />
                <Text style={styles.airLegendText}>{band.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.airTrendUpdated}>
            Updated{" "}
            {airLastUpdatedAt ? formatTimeAgo(airLastUpdatedAt) : "just now"}
          </Text>
        </View>

        <View style={styles.airMetricGrid}>
          {[
            { label: "PM2.5", value: formatMetric(airPm25, "ug/m3") },
            { label: "PM10", value: formatMetric(airPm10, "ug/m3") },
            { label: "CO2", value: formatMetric(airCo2, "ppm") },
            { label: "VOC", value: formatMetric(airVoc, "ppb") },
            { label: "HCHO", value: formatMetric(airFormaldehyde, "mg/m3", 2) },
            { label: "Pollen", value: formatMetric(airPollen, "idx", 1) },
            {
              label: "Temp",
              value: formatMetric(
                typeof deviceTempC === "number" ? deviceTempC : roomTemp,
                "C",
                1,
              ),
            },
            { label: "Humidity", value: formatMetric(humidity, "%") },
            { label: "AQI", value: airQuality > 0 ? `${airQuality}` : "--" },
          ].map((metric) => (
            <View key={`air-metric-${metric.label}`} style={airMetricCardStyle}>
              <Text style={styles.airMetricValue}>{metric.value}</Text>
              <Text style={styles.airMetricLabel}>{metric.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.airCompareRow}>
          <View style={styles.airCompareCard}>
            <Text style={styles.airCompareTitle}>Indoor</Text>
            <Text style={styles.airCompareValue}>
              AQI {airQuality > 0 ? airQuality : "--"}
            </Text>
            <Text style={styles.airCompareSub}>
              CO2 {formatMetric(airCo2, "ppm")}
            </Text>
            <Text style={styles.airCompareSub}>
              PM2.5 {formatMetric(airPm25, "ug/m3")}
            </Text>
            <Text style={styles.airCompareSub}>
              Humidity {formatMetric(humidity, "%")}
            </Text>
            <Text style={styles.airCompareSub}>
              Temp{" "}
              {formatMetric(
                typeof deviceTempC === "number" ? deviceTempC : roomTemp,
                "C",
                1,
              )}
            </Text>
          </View>
          <View style={styles.airCompareCard}>
            <Text style={styles.airCompareTitle}>Outdoor</Text>
            <Text style={styles.airCompareValue}>
              AQI {airOutdoorAqi > 0 ? airOutdoorAqi : "--"}
            </Text>
            <Text style={styles.airCompareSub}>
              CO2 {formatMetric(airOutdoorCo2, "ppm")}
            </Text>
            <Text style={styles.airCompareSub}>
              PM2.5 {formatMetric(airOutdoorPm25, "ug/m3")}
            </Text>
            <Text style={styles.airCompareSub}>
              Humidity {formatMetric(airOutdoorHumidity, "%")}
            </Text>
            <Text style={styles.airCompareSub}>
              Temp {formatMetric(airOutdoorTempC, "C", 1)}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flex: 1, gap: 12 }}>
        <View style={airSurfaceCardStyle}>
          <Text style={styles.cardLabel}>Recommendations</Text>
          {airRecommendations.map((item, index) => (
            <View key={`air-rec-${index}`} style={styles.airRecommendationRow}>
              <Ionicons name="sparkles" size={14} color={stylesVars.ink} />
              <Text style={styles.airRecommendationText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.airKpiRow}>
          <View style={styles.airKpiCard}>
            <Text style={styles.airKpiValue}>{airFilterLife}%</Text>
            <Text style={styles.airKpiLabel}>Filter life</Text>
          </View>
          <View style={styles.airKpiCard}>
            <Text style={styles.airKpiValue}>{airFilterDaysLeft} days</Text>
            <Text style={styles.airKpiLabel}>Replace in</Text>
          </View>
        </View>

        {airFilterLife <= 20 && (
          <View style={styles.airAlertCard}>
            <Ionicons name="warning" size={14} color="#D8465B" />
            <Text style={styles.airAlertText}>Replace filter soon</Text>
          </View>
        )}

        <View style={airSurfaceCardStyle}>
          <Text style={styles.cardLabel}>Alerts</Text>
          <View style={controlCardRowTopStyle}>
            <Pressable
              style={controlPillStyle(airAlertsEnabled)}
              onPress={() => onPatch({ airAlertsEnabled: !airAlertsEnabled })}
            >
              <Text style={controlPillTextStyle(airAlertsEnabled)}>
                {airAlertsEnabled ? "Alerts on" : "Alerts off"}
              </Text>
            </Pressable>
          </View>
          {renderAirAlertSlider(
            "AQI",
            airAlertAqi,
            50,
            200,
            1,
            `${airAlertAqi}`,
            (value) => onPatch({ airAlertAqi: Math.round(value) }),
          )}
          {renderAirAlertSlider(
            "CO2",
            airAlertCo2,
            600,
            2000,
            10,
            `${airAlertCo2} ppm`,
            (value) => onPatch({ airAlertCo2: Math.round(value) }),
          )}
          {renderAirAlertSlider(
            "PM2.5",
            airAlertPm25,
            10,
            120,
            1,
            `${airAlertPm25} ug/m3`,
            (value) => onPatch({ airAlertPm25: Math.round(value) }),
          )}
          {renderAirAlertSlider(
            "PM10",
            airAlertPm10,
            20,
            160,
            1,
            `${airAlertPm10} ug/m3`,
            (value) => onPatch({ airAlertPm10: Math.round(value) }),
          )}
          {renderAirAlertSlider(
            "VOC",
            airAlertVoc,
            80,
            800,
            10,
            `${airAlertVoc} ppb`,
            (value) => onPatch({ airAlertVoc: Math.round(value) }),
          )}
          {renderAirAlertSlider(
            "Pollen",
            airAlertPollen,
            1,
            5,
            1,
            `${airAlertPollen} idx`,
            (value) => onPatch({ airAlertPollen: Math.round(value) }),
          )}
        </View>

        <View style={airSurfaceCardStyle}>
          <Text style={styles.cardLabel}>Sensor map</Text>
          {airSensors.length === 0 ? (
            <Text style={styles.scheduleEmpty}>No air sensors yet</Text>
          ) : (
            <View style={styles.airSensorList}>
              {airSensors.map((sensor) => {
                const isActive = sensor.id === activeSensorId;
                const sensorBand = resolveAirBand(sensor.airQualityIndex ?? 0);
                return (
                  <Pressable
                    key={sensor.id}
                    style={airSensorRowStyle(isActive)}
                    onPress={() => onSelectSensor(sensor.id)}
                  >
                    <View style={airSensorDotStyle(sensorBand.color)} />
                    <View style={flex1Style}>
                      <Text style={styles.airSensorName}>{sensor.name}</Text>
                      <Text style={styles.airSensorSub}>
                        {roomLookup.get(sensor.roomId) ?? ""}
                      </Text>
                    </View>
                    <Text style={styles.airSensorValue}>
                      AQI {sensor.airQualityIndex ? sensor.airQualityIndex : "--"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </View>
  );

  const portraitCards = (
    <>
      <View style={airTrendCardStyle}>
        <View style={styles.airTrendHeader}>
          <Text style={styles.cardLabel}>24h trend</Text>
          <View style={airTrendPillStyle}>
            <Ionicons name={airTrendIcon} size={14} color={airBand.color} />
            <Text style={styles.airTrendText}>{airTrendLabel}</Text>
          </View>
        </View>
        <View style={styles.airTrendChartFrame}>
          <View style={styles.airChart}>
            {airSeriesAqi.map((value, index) => {
              const height = Math.max(
                6,
                Math.round((value / airChartMax) * airChartMaxHeight),
              );
              const band = resolveAirBand(value);
              return (
                <View
                  key={`air-bar-${index}`}
                  style={airChartBarStyle(
                    height,
                    band.color,
                    index === airSeriesAqi.length - 1 ? 1 : 0.6,
                  )}
                />
              );
            })}
          </View>
        </View>
        <View style={styles.airLegendRow}>
          {airLegendBands.map((band) => (
            <View key={`air-legend-${band.label}`} style={styles.airLegendItem}>
              <View style={airLegendDotStyle(band.color)} />
              <Text style={styles.airLegendText}>{band.label}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.airTrendUpdated}>
          Updated{" "}
          {airLastUpdatedAt ? formatTimeAgo(airLastUpdatedAt) : "just now"}
        </Text>
      </View>

      <View style={styles.airMetricGrid}>
        {[
          { label: "PM2.5", value: formatMetric(airPm25, "ug/m3") },
          { label: "PM10", value: formatMetric(airPm10, "ug/m3") },
          { label: "CO2", value: formatMetric(airCo2, "ppm") },
          { label: "VOC", value: formatMetric(airVoc, "ppb") },
          { label: "HCHO", value: formatMetric(airFormaldehyde, "mg/m3", 2) },
          { label: "Pollen", value: formatMetric(airPollen, "idx", 1) },
          {
            label: "Temp",
            value: formatMetric(
              typeof deviceTempC === "number" ? deviceTempC : roomTemp,
              "C",
              1,
            ),
          },
          { label: "Humidity", value: formatMetric(humidity, "%") },
          { label: "AQI", value: airQuality > 0 ? `${airQuality}` : "--" },
        ].map((metric) => (
          <View key={`air-metric-${metric.label}`} style={airMetricCardStyle}>
            <Text style={styles.airMetricValue}>{metric.value}</Text>
            <Text style={styles.airMetricLabel}>{metric.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.airKpiRow}>
        <View style={styles.airKpiCard}>
          <Text style={styles.airKpiValue}>{airFilterLife}%</Text>
          <Text style={styles.airKpiLabel}>Filter life</Text>
        </View>
        <View style={styles.airKpiCard}>
          <Text style={styles.airKpiValue}>{airFilterDaysLeft} days</Text>
          <Text style={styles.airKpiLabel}>Replace in</Text>
        </View>
      </View>

      {airFilterLife <= 20 && (
        <View style={styles.airAlertCard}>
          <Ionicons name="warning" size={14} color="#D8465B" />
          <Text style={styles.airAlertText}>Replace filter soon</Text>
        </View>
      )}

      <View style={airSurfaceCardStyle}>
        <Text style={styles.cardLabel}>Purifier</Text>
        <OptionChips
          options={["auto", "manual", "sleep", "boost"].map((mode) => ({
            value: mode,
            label:
              mode === "auto"
                ? "Auto"
                : mode === "manual"
                  ? "Manual"
                  : mode === "sleep"
                    ? "Sleep"
                    : "Boost",
          }))}
          value={airPurifierMode}
          onSelect={(mode) =>
            onPatch({
              airPurifierMode: mode as Device["airPurifierMode"],
              isOn: true,
            })
          }
          rowStyle={styles.chipRow}
          chipStyle={chipStyle}
          chipTextStyle={chipTextStyle}
        />
        <View style={styles.pressureSliderRow}>
          <Text style={styles.pressureSliderLabel}>Fan</Text>
          <Text style={styles.pressureSliderValue}>{airPurifierSpeed}%</Text>
        </View>
        <Slider
          value={airPurifierSpeed}
          minimumValue={0}
          maximumValue={100}
          step={1}
          onSlidingComplete={(value) =>
            onPatch({ airPurifierSpeed: Math.round(value), isOn: true })
          }
          minimumTrackTintColor="rgba(122,92,255,0.9)"
          maximumTrackTintColor="rgba(12,12,18,0.12)"
          thumbTintColor="rgba(255,255,255,0.92)"
          style={styles.pressureSlider}
        />
        <View style={controlCardRowTopStyle}>
          <Pressable
            style={controlPillStyle(airIonizerEnabled)}
            onPress={() => onPatch({ airIonizerEnabled: !airIonizerEnabled })}
          >
            <Text style={controlPillTextStyle(airIonizerEnabled)}>
              {airIonizerEnabled ? "Ionizer" : "Ionizer Off"}
            </Text>
          </Pressable>
          <Pressable
            style={controlPillStyle(airAutoVentilation)}
            onPress={() =>
              onPatch({ airAutoVentilation: !airAutoVentilation })
            }
          >
            <Text style={controlPillTextStyle(airAutoVentilation)}>
              {airAutoVentilation ? "Auto Vent" : "Vent Off"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={airSurfaceCardStyle}>
        <Text style={styles.cardLabel}>Recommendations</Text>
        {airRecommendations.map((item, index) => (
          <View key={`air-rec-${index}`} style={styles.airRecommendationRow}>
            <Ionicons name="sparkles" size={14} color={stylesVars.ink} />
            <Text style={styles.airRecommendationText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.airCompareRow}>
        <View style={styles.airCompareCard}>
          <Text style={styles.airCompareTitle}>Indoor</Text>
          <Text style={styles.airCompareValue}>
            AQI {airQuality > 0 ? airQuality : "--"}
          </Text>
          <Text style={styles.airCompareSub}>
            CO2 {formatMetric(airCo2, "ppm")}
          </Text>
          <Text style={styles.airCompareSub}>
            PM2.5 {formatMetric(airPm25, "ug/m3")}
          </Text>
          <Text style={styles.airCompareSub}>
            Humidity {formatMetric(humidity, "%")}
          </Text>
          <Text style={styles.airCompareSub}>
            Temp{" "}
            {formatMetric(
              typeof deviceTempC === "number" ? deviceTempC : roomTemp,
              "C",
              1,
            )}
          </Text>
        </View>
        <View style={styles.airCompareCard}>
          <Text style={styles.airCompareTitle}>Outdoor</Text>
          <Text style={styles.airCompareValue}>
            AQI {airOutdoorAqi > 0 ? airOutdoorAqi : "--"}
          </Text>
          <Text style={styles.airCompareSub}>
            CO2 {formatMetric(airOutdoorCo2, "ppm")}
          </Text>
          <Text style={styles.airCompareSub}>
            PM2.5 {formatMetric(airOutdoorPm25, "ug/m3")}
          </Text>
          <Text style={styles.airCompareSub}>
            Humidity {formatMetric(airOutdoorHumidity, "%")}
          </Text>
          <Text style={styles.airCompareSub}>
            Temp {formatMetric(airOutdoorTempC, "C", 1)}
          </Text>
        </View>
      </View>

      <View style={airSurfaceCardStyle}>
        <Text style={styles.cardLabel}>Alerts</Text>
        <View style={controlCardRowTopStyle}>
          <Pressable
            style={controlPillStyle(airAlertsEnabled)}
            onPress={() => onPatch({ airAlertsEnabled: !airAlertsEnabled })}
          >
            <Text style={controlPillTextStyle(airAlertsEnabled)}>
              {airAlertsEnabled ? "Alerts on" : "Alerts off"}
            </Text>
          </Pressable>
        </View>
        {renderAirAlertSlider(
          "AQI",
          airAlertAqi,
          50,
          200,
          1,
          `${airAlertAqi}`,
          (value) => onPatch({ airAlertAqi: Math.round(value) }),
        )}
        {renderAirAlertSlider(
          "CO2",
          airAlertCo2,
          600,
          2000,
          10,
          `${airAlertCo2} ppm`,
          (value) => onPatch({ airAlertCo2: Math.round(value) }),
        )}
        {renderAirAlertSlider(
          "PM2.5",
          airAlertPm25,
          10,
          120,
          1,
          `${airAlertPm25} ug/m3`,
          (value) => onPatch({ airAlertPm25: Math.round(value) }),
        )}
        {renderAirAlertSlider(
          "PM10",
          airAlertPm10,
          20,
          160,
          1,
          `${airAlertPm10} ug/m3`,
          (value) => onPatch({ airAlertPm10: Math.round(value) }),
        )}
        {renderAirAlertSlider(
          "VOC",
          airAlertVoc,
          80,
          800,
          10,
          `${airAlertVoc} ppb`,
          (value) => onPatch({ airAlertVoc: Math.round(value) }),
        )}
        {renderAirAlertSlider(
          "Pollen",
          airAlertPollen,
          1,
          5,
          1,
          `${airAlertPollen} idx`,
          (value) => onPatch({ airAlertPollen: Math.round(value) }),
        )}
      </View>

      <View style={airSurfaceCardStyle}>
        <Text style={styles.cardLabel}>Sensor map</Text>
        {airSensors.length === 0 ? (
          <Text style={styles.scheduleEmpty}>No air sensors yet</Text>
        ) : (
          <View style={styles.airSensorList}>
            {airSensors.map((sensor) => {
              const isActive = sensor.id === activeSensorId;
              const sensorBand = resolveAirBand(sensor.airQualityIndex ?? 0);
              return (
                <Pressable
                  key={sensor.id}
                  style={airSensorRowStyle(isActive)}
                  onPress={() => onSelectSensor(sensor.id)}
                >
                  <View style={airSensorDotStyle(sensorBand.color)} />
                  <View style={flex1Style}>
                    <Text style={styles.airSensorName}>{sensor.name}</Text>
                    <Text style={styles.airSensorSub}>
                      {roomLookup.get(sensor.roomId) ?? ""}
                    </Text>
                  </View>
                  <Text style={styles.airSensorValue}>
                    AQI {sensor.airQualityIndex ? sensor.airQualityIndex : "--"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </>
  );

  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>
        {heroCard}
        {detailCards}
      </View>
      <View style={landscapeColumnSecondaryStyle}>{detailCardsRight}</View>
    </View>
  ) : (
    <>
      {heroCard}
      {isTabletPortrait ? tabletPortraitGrid : portraitCards}
    </>
  );
}
