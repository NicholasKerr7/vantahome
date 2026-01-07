import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../app/AppNavigator";
import { useHomeStore } from "../store/useHomeStore";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useResponsive } from "../theme/layout";
import BackgroundLines from "../components/BackgroundLines";
import { theme } from "../theme/theme";
import LottieView from "lottie-react-native";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "../services/supabaseClient";
import { bootstrapHome } from "../services/cloudRegistry";

WebBrowser.maybeCompleteAuthSession();

const AUTH_LOTTIE_SOURCE = require("../../assets/animations/Coffee Clicky.json");

const redirectUri = AuthSession.makeRedirectUri({
  scheme: "vantahome",
  path: "auth-callback",
});

type OAuthProvider = "apple" | "google";

const getAuthParams = (url: string) => {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  if (parsed.hash) {
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    hashParams.forEach((value, key) => params.set(key, value));
  }
  return params;
};

type Props = NativeStackScreenProps<RootStackParamList, "Auth">;

export default function AuthScreen({ navigation }: Props) {
  const { contentWidth, gutter, isTablet, isLandscape, scale } =
    useResponsive(640);
  const cardWidth = Math.min(
    contentWidth - gutter * 2,
    isTablet ? (isLandscape ? 640 : 560) : 420,
  );
  const cardPad = Math.round((isTablet ? 22 : 18) * scale);
  const cardRadius = Math.round((isTablet ? 30 : 28) * scale);
  const authLottieSize = Math.round((isTablet ? 190 : 150) * scale);
  const authLottieGap = Math.round((isTablet ? 14 : 10) * scale);
  const titleSize = Math.round((isTablet ? 28 : 24) * scale);
  const subSize = Math.round((isTablet ? 14 : 12) * scale);
  const segmentHeight = Math.round((isTablet ? 40 : 36) * scale);
  const segmentText = Math.round((isTablet ? 13 : 12) * scale);
  const labelSize = Math.round((isTablet ? 13 : 12) * scale);
  const inputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const inputRadius = Math.round(inputHeight * 0.32);
  const eyeBtnSize = inputHeight;
  const hintSize = Math.round((isTablet ? 13 : 12) * scale);
  const ctaHeight = Math.round((isTablet ? 58 : 54) * scale);
  const ctaText = Math.round((isTablet ? 14 : 13) * scale);
  const socialHeight = Math.round((isTablet ? 50 : 46) * scale);
  const setProfile = useHomeStore((s) => s.setProfile);
  const profile = useHomeStore((s) => s.profile);
  const [mode, setMode] = useState<"create" | "login">("create");
  const [name, setName] = useState(profile.name ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [emailAuthLoading, setEmailAuthLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const emailValid = useMemo(() => /\S+@\S+\.\S+/.test(email.trim()), [email]);
  const passwordOk = password.trim().length >= 6;
  const confirmOk =
    mode === "create"
      ? confirm.trim().length >= 6 && confirm.trim() === password.trim()
      : true;
  const canContinue =
    mode === "login"
      ? emailValid && passwordOk
      : name.trim().length > 1 && emailValid && passwordOk && confirmOk;

  const applyProfileFromUser = (
    user?: { email?: string; user_metadata?: Record<string, any> } | null,
  ) => {
    const safeEmail = email.trim();
    const fallbackName =
      safeEmail.split("@")[0]?.replace(/[._-]+/g, " ") ?? "Home";
    const meta = user?.user_metadata ?? {};
    const metaName =
      meta.full_name ||
      meta.name ||
      meta.preferred_username ||
      meta.nickname ||
      meta.given_name;
    const nextName =
      metaName ||
      (mode === "login" ? profile.name || fallbackName : name.trim()) ||
      "Vanta Home";
    setProfile({ name: nextName, email: user?.email ?? safeEmail });
    const homeName = profile.homeName?.trim() || `${nextName}'s Home`;
    void bootstrapHome(homeName).catch(() => {});
    navigation.replace("Onboarding");
  };

  const handleContinue = async () => {
    if (!supabase) {
      Alert.alert(
        "Missing configuration",
        "Add your Supabase URL and anon key to .env to enable email login.",
      );
      return;
    }
    if (emailAuthLoading || oauthLoading) return;
    if (!canContinue) return;
    setEmailAuthLoading(true);
    const safeEmail = email.trim();
    try {
      if (mode === "create") {
        const { data, error } = await supabase.auth.signUp({
          email: safeEmail,
          password,
          options: { data: { full_name: name.trim() } },
        });
        if (error) {
          Alert.alert("Sign-up failed", error.message);
          return;
        }
        if (data.session?.user) {
          applyProfileFromUser(data.session.user);
          return;
        }
        if (data.user) {
          setProfile({
            name:
              name.trim() ||
              data.user.email?.split("@")[0]?.replace(/[._-]+/g, " ") ||
              "Vanta Home",
            email: data.user.email ?? safeEmail,
          });
        }
        Alert.alert("Check your email", "Confirm your email, then sign in.");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: safeEmail,
        password,
      });
      if (error) {
        Alert.alert("Sign-in failed", error.message);
        return;
      }
      if (data.user) {
        applyProfileFromUser(data.user);
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        applyProfileFromUser(userData.user);
        return;
      }
      Alert.alert(
        "Sign-in failed",
        "Unable to read your account details. Please try again.",
      );
    } catch (err: any) {
      Alert.alert(
        "Sign-in failed",
        err?.message ?? "Unable to complete sign-in.",
      );
    } finally {
      setEmailAuthLoading(false);
    }
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    if (!supabase) {
      Alert.alert(
        "Missing configuration",
        "Add your Supabase URL and anon key to .env to enable social login.",
      );
      return;
    }
    if (oauthLoading || emailAuthLoading) return;
    setOauthLoading(provider);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: redirectUri },
      });
      if (error || !data?.url) {
        Alert.alert(
          "Sign-in failed",
          error?.message ?? "Unable to start OAuth flow.",
        );
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUri,
      );
      if (result.type !== "success" || !result.url) {
        return;
      }

      const params = getAuthParams(result.url);
      const code = params.get("code");
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      let sessionUser = null as null | {
        email?: string;
        user_metadata?: Record<string, any>;
      };

      if (code) {
        const { data: exchangeData, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          Alert.alert("Sign-in failed", exchangeError.message);
          return;
        }
        sessionUser = exchangeData.session?.user ?? null;
      } else if (accessToken && refreshToken) {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        if (sessionError) {
          Alert.alert("Sign-in failed", sessionError.message);
          return;
        }
        sessionUser = sessionData.session?.user ?? null;
      }

      if (!sessionUser) {
        const { data: userData } = await supabase.auth.getUser();
        sessionUser = userData.user ?? null;
      }

      if (sessionUser) {
        const userEmail = sessionUser.email ?? profile.email ?? "";
        const meta = sessionUser.user_metadata ?? {};
        const userName =
          meta.full_name ||
          meta.name ||
          meta.preferred_username ||
          userEmail.split("@")[0]?.replace(/[._-]+/g, " ") ||
          profile.name ||
          "Vanta Home";
        setProfile({ name: userName, email: userEmail });
        navigation.replace("Onboarding");
      } else {
        Alert.alert(
          "Sign-in failed",
          "Unable to read your account details. Please try again.",
        );
      }
    } catch (err: any) {
      Alert.alert(
        "Sign-in failed",
        err?.message ?? "Unable to complete OAuth.",
      );
    } finally {
      setOauthLoading(null);
    }
  };

  const handleResetPassword = async () => {
    const safeEmail = email.trim();
    if (!safeEmail) {
      Alert.alert(
        "Email required",
        "Enter your email address to reset your password.",
      );
      return;
    }
    if (!supabase) {
      Alert.alert(
        "Missing configuration",
        "Add your Supabase URL and anon key to .env to enable password reset.",
      );
      return;
    }
    if (resetLoading || emailAuthLoading || oauthLoading) return;
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(safeEmail);
      if (error) {
        Alert.alert("Reset failed", error.message);
        return;
      }
      Alert.alert(
        "Check your email",
        "We sent a password reset link to your inbox.",
      );
    } catch (err: any) {
      Alert.alert(
        "Reset failed",
        err?.message ?? "Unable to send reset email.",
      );
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.outer, { padding: gutter }]}
    >
      <BackgroundLines />
      <LinearGradient
        colors={["rgba(180,107,255,0.42)", "rgba(180,107,255,0.0)"]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.auroraTop}
      />
      <LinearGradient
        colors={["rgba(122,92,255,0.35)", "rgba(122,92,255,0.0)"]}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.auroraBottom}
      />
      <View style={styles.orbitRing} />
      <View style={styles.orbitRingSmall} />
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.card,
              { width: cardWidth, padding: cardPad, borderRadius: cardRadius },
            ]}
          >
            <View
              style={[
                styles.authLottieWrap,
                {
                  width: authLottieSize,
                  height: authLottieSize,
                  marginBottom: authLottieGap,
                  borderRadius: Math.round(authLottieSize / 2),
                },
              ]}
            >
              <LinearGradient
                colors={["rgba(255,255,255,0.98)", "rgba(255,255,255,0.85)"]}
                start={{ x: 0.2, y: 0.1 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.authLottieBackdrop}
              />
              <LottieView
                source={AUTH_LOTTIE_SOURCE}
                autoPlay
                loop
                resizeMode="contain"
                style={styles.authLottie}
              />
              <LinearGradient
                colors={[
                  "rgba(255,255,255,0.6)",
                  "rgba(255,255,255,0.0)",
                  "rgba(255,255,255,0.6)",
                ]}
                locations={[0, 0.5, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.authLottieFade}
                pointerEvents="none"
              />
            </View>
            <Text style={[styles.h1, { fontSize: titleSize }]}>
              Welcome to VantaHome
            </Text>
            <Text style={[styles.sub, { fontSize: subSize }]}>
              Create an account or sign in to sync devices across every
              ecosystem.
            </Text>

            <View style={styles.segment}>
              {(["create", "login"] as const).map((k) => (
                <Pressable
                  key={k}
                  style={[
                    styles.segmentBtn,
                    { height: segmentHeight },
                    mode === k && styles.segmentBtnActive,
                  ]}
                  onPress={() => setMode(k)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { fontSize: segmentText },
                      mode === k && styles.segmentTextActive,
                    ]}
                  >
                    {k === "create" ? "Create" : "Login"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {mode === "create" && (
              <View style={styles.field}>
                <Text style={[styles.label, { fontSize: labelSize }]}>
                  Full name
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Nick Kerr"
                  placeholderTextColor="rgba(12,12,18,0.35)"
                  style={[
                    styles.input,
                    { height: inputHeight, borderRadius: inputRadius },
                  ]}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={[styles.label, { fontSize: labelSize }]}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="rgba(12,12,18,0.35)"
                style={[
                  styles.input,
                  { height: inputHeight, borderRadius: inputRadius },
                ]}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { fontSize: labelSize }]}>
                Password
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(12,12,18,0.35)"
                  style={[
                    styles.input,
                    styles.inputInline,
                    { height: inputHeight, borderRadius: inputRadius },
                  ]}
                  secureTextEntry={!showPassword}
                  returnKeyType={mode === "create" ? "next" : "done"}
                />
                <Pressable
                  style={[
                    styles.eyeBtn,
                    {
                      width: eyeBtnSize,
                      height: eyeBtnSize,
                      borderRadius: inputRadius,
                    },
                  ]}
                  onPress={() => setShowPassword((v) => !v)}
                >
                  <Ionicons
                    name={showPassword ? "eye-off" : "eye"}
                    size={Math.round(18 * scale)}
                    color="rgba(12,12,18,0.55)"
                  />
                </Pressable>
              </View>
            </View>

            {mode === "create" && (
              <View style={styles.field}>
                <Text style={[styles.label, { fontSize: labelSize }]}>
                  Confirm password
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    value={confirm}
                    onChangeText={setConfirm}
                    placeholder="••••••••"
                    placeholderTextColor="rgba(12,12,18,0.35)"
                    style={[
                      styles.input,
                      styles.inputInline,
                      { height: inputHeight, borderRadius: inputRadius },
                    ]}
                    secureTextEntry={!showConfirm}
                    returnKeyType="done"
                  />
                  <Pressable
                    style={[
                      styles.eyeBtn,
                      {
                        width: eyeBtnSize,
                        height: eyeBtnSize,
                        borderRadius: inputRadius,
                      },
                    ]}
                    onPress={() => setShowConfirm((v) => !v)}
                  >
                    <Ionicons
                      name={showConfirm ? "eye-off" : "eye"}
                      size={Math.round(18 * scale)}
                      color="rgba(12,12,18,0.55)"
                    />
                  </Pressable>
                </View>
              </View>
            )}

            <View style={styles.hintRow}>
              <Text style={[styles.hintText, { fontSize: hintSize }]}>
                {mode === "create"
                  ? "Password must be at least 6 characters."
                  : "Forgot password?"}
              </Text>
              {mode === "login" && (
                <Pressable
                  onPress={handleResetPassword}
                  disabled={resetLoading}
                >
                  <Text style={[styles.hintLink, { fontSize: hintSize }]}>
                    {resetLoading ? "Sending…" : "Reset"}
                  </Text>
                </Pressable>
              )}
            </View>

            <Pressable
              style={[
                styles.cta,
                (!canContinue || emailAuthLoading) && styles.ctaDisabled,
              ]}
              onPress={handleContinue}
              disabled={!canContinue || emailAuthLoading}
            >
              <LinearGradient
                colors={["#B08CFF", "#6B3CFF"]}
                start={{ x: 0.1, y: 0.2 }}
                end={{ x: 0.9, y: 0.9 }}
                style={[
                  styles.ctaInner,
                  { height: ctaHeight },
                  !canContinue && { opacity: 0.6 },
                ]}
              >
                {emailAuthLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={[styles.ctaText, { fontSize: ctaText }]}>
                      {mode === "create" ? "Create account" : "Sign in"}
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={Math.round(16 * scale)}
                      color="#FFFFFF"
                      style={{ marginLeft: 8 }}
                    />
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>or</Text>
              <View style={styles.orLine} />
            </View>

            <View style={styles.socialRow}>
              <Pressable
                style={[
                  styles.socialBtn,
                  {
                    height: socialHeight,
                    borderRadius: Math.round(socialHeight * 0.3),
                  },
                  oauthLoading && styles.socialBtnDisabled,
                ]}
                onPress={() => handleOAuth("apple")}
                disabled={oauthLoading !== null || emailAuthLoading}
              >
                {oauthLoading === "apple" ? (
                  <ActivityIndicator size="small" color="#0C0C12" />
                ) : (
                  <Ionicons
                    name="logo-apple"
                    size={Math.round(18 * scale)}
                    color="#0C0C12"
                  />
                )}
                <Text style={[styles.socialText, { fontSize: segmentText }]}>
                  Apple
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.socialBtn,
                  {
                    height: socialHeight,
                    borderRadius: Math.round(socialHeight * 0.3),
                  },
                  oauthLoading && styles.socialBtnDisabled,
                ]}
                onPress={() => handleOAuth("google")}
                disabled={oauthLoading !== null || emailAuthLoading}
              >
                {oauthLoading === "google" ? (
                  <ActivityIndicator size="small" color="#0C0C12" />
                ) : (
                  <Ionicons
                    name="logo-google"
                    size={Math.round(18 * scale)}
                    color="#0C0C12"
                  />
                )}
                <Text style={[styles.socialText, { fontSize: segmentText }]}>
                  Google
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => navigation.replace("Onboarding")}
              style={styles.skip}
            >
              <Text style={[styles.skipText, { fontSize: hintSize }]}>
                Skip for now
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { flex: 1, justifyContent: "center" },
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  auroraTop: {
    position: "absolute",
    top: -220,
    right: -180,
    width: 520,
    height: 520,
    borderRadius: 260,
    transform: [{ rotate: "16deg" }],
  },
  auroraBottom: {
    position: "absolute",
    bottom: -240,
    left: -180,
    width: 520,
    height: 520,
    borderRadius: 260,
    transform: [{ rotate: "-12deg" }],
  },
  orbitRing: {
    position: "absolute",
    top: -240,
    left: -140,
    width: 520,
    height: 520,
    borderRadius: 260,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  orbitRingSmall: {
    position: "absolute",
    bottom: -140,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    borderWidth: 1,
    borderColor: "rgba(180,107,255,0.22)",
  },
  glowTop: {
    position: "absolute",
    top: -160,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(180,107,255,0.28)",
  },
  glowBottom: {
    position: "absolute",
    bottom: -200,
    left: -140,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: "rgba(122,92,255,0.26)",
  },
  card: {
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.94)",
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
    shadowColor: "#6B3CFF",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  authLottieWrap: {
    alignSelf: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
  },
  authLottieBackdrop: { ...StyleSheet.absoluteFillObject },
  authLottie: { width: "100%", height: "100%", opacity: 1 },
  authLottieFade: { ...StyleSheet.absoluteFillObject },
  h1: { fontSize: 24, fontWeight: "900", color: "#0C0C12" },
  sub: { marginTop: 6, color: "rgba(12,12,18,0.55)", fontWeight: "700" },
  segment: {
    flexDirection: "row",
    backgroundColor: "rgba(12,12,18,0.08)",
    borderRadius: 999,
    marginTop: 16,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBtnActive: { backgroundColor: "#FFFFFF" },
  segmentText: { fontWeight: "800", color: "rgba(12,12,18,0.55)" },
  segmentTextActive: { color: "#0C0C12" },
  field: { marginTop: 12 },
  label: { color: "rgba(12,12,18,0.75)", fontWeight: "800", marginBottom: 6 },
  input: {
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    paddingHorizontal: 12,
    color: "#0C0C12",
    fontWeight: "700",
  },
  inputRow: { flexDirection: "row", alignItems: "center" },
  inputInline: { flex: 1 },
  eyeBtn: {
    marginLeft: 8,
    width: 40,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(12,12,18,0.06)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  hintText: { color: "rgba(12,12,18,0.45)", fontWeight: "700", fontSize: 12 },
  hintLink: { color: "#6B3CFF", fontWeight: "800", fontSize: 12 },
  cta: { marginTop: 22, borderRadius: 999, overflow: "hidden" },
  ctaInner: {
    height: 54,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6B3CFF",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  ctaText: { color: "#FFFFFF", fontWeight: "800" },
  ctaDisabled: { opacity: 0.65 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  orLine: { flex: 1, height: 1, backgroundColor: "rgba(12,12,18,0.12)" },
  orText: { color: "rgba(12,12,18,0.45)", fontWeight: "800", fontSize: 12 },
  socialRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  socialBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(12,12,18,0.06)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  socialBtnDisabled: { opacity: 0.6 },
  socialText: { color: "#0C0C12", fontWeight: "800" },
  skip: { marginTop: 14, alignSelf: "center" },
  skipText: { color: "rgba(12,12,18,0.55)", fontWeight: "800" },
});
