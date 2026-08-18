import React, { useEffect, useMemo, useState } from "react";
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
  type StyleProp,
  type TextStyle,
  type ViewStyle,
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
import * as WebBrowser from "expo-web-browser";
import { supabase } from "../services/supabaseClient";
import { bootstrapHome } from "../services/cloudRegistry";
import LandscapeFrame from "../components/LandscapeFrame";
import {
  getAuthRedirectParams,
  makeAuthCallbackUri,
} from "../config/authRedirects";
import {
  fetchAuthProviderAvailability,
  type AuthProviderAvailability,
} from "../services/authProviderAvailability";

WebBrowser.maybeCompleteAuthSession();

const AUTH_LOTTIE_SOURCE = require("../../assets/animations/auth-hero.json");

const redirectUri = makeAuthCallbackUri();

type OAuthProvider = "apple" | "google";

type Props = NativeStackScreenProps<RootStackParamList, "Auth">;

export default function AuthScreen({}: Props) {
  const { contentWidth, gutter, isTablet, isLandscape, scale, height } =
    useResponsive(640);
  const useLandscapeFrame = isLandscape;
  const maxCardWidth = isLandscape
    ? isTablet
      ? 760
      : 520
    : isTablet
      ? 560
      : 420;
  const cardWidth = Math.min(contentWidth - gutter * 2, maxCardWidth);
  const cardPad = Math.round((isTablet ? 22 : 18) * scale);
  const landscapeCardPad = useLandscapeFrame
    ? Math.round(cardPad * (isTablet ? 0.92 : 0.88))
    : cardPad;
  const cardRadius = Math.round((isTablet ? 30 : 28) * scale);
  const framePad = Math.round((isTablet ? 10 : 8) * scale);
  const frameRadius = Math.round(cardRadius + framePad);
  const frameWidth = useLandscapeFrame
    ? Math.min(contentWidth - gutter * 2, cardWidth + framePad * 2)
    : cardWidth;
  const authLottieScale = isLandscape ? (isTablet ? 1.5 : 1.4) : 1;
  const authLottieSize = Math.round(
    (isTablet ? 190 : 150) * scale * authLottieScale,
  );
  const authLottieGap = Math.round(
    (isTablet ? 14 : 10) * scale * (isLandscape ? 2 : 1),
  );
  const titleSize = Math.round((isTablet ? 28 : 24) * scale);
  const landscapeTitleSize = Math.round(
    titleSize * (isTablet ? 1.6 : 1.4),
  );
  const heroTitleGap = Math.round((isTablet ? 12 : 8) * scale);
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
  const landscapeGap = Math.round((isTablet ? 26 : 18) * scale);
  const landscapeColumnPad = Math.round((isTablet ? 6 : 4) * scale);
  const scrollPad = Math.round((isLandscape ? 16 : 0) * scale);
  const scrollMinHeight = Math.max(0, height - gutter * 2);
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
  const [authProviders, setAuthProviders] = useState<AuthProviderAvailability>({
    apple: false,
    google: false,
  });

  useEffect(() => {
    let active = true;
    void fetchAuthProviderAvailability().then((providers) => {
      if (active) setAuthProviders(providers);
    });
    return () => {
      active = false;
    };
  }, []);

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
  const lottieWrapLayout: ViewStyle = {
    width: authLottieSize,
    height: authLottieSize,
    marginBottom: authLottieGap,
    borderRadius: Math.round(authLottieSize / 2),
  };
  const lottieWrapStyle: StyleProp<ViewStyle> = [
    styles.authLottieWrap,
    lottieWrapLayout,
    useLandscapeFrame && styles.authLottieWrapLandscape,
  ];
  const heroTitleLayout: TextStyle = {
    fontSize: useLandscapeFrame ? landscapeTitleSize : titleSize,
    marginBottom: useLandscapeFrame ? heroTitleGap : 0,
  };
  const heroTitleStyle: StyleProp<TextStyle> = [
    styles.h1,
    heroTitleLayout,
    useLandscapeFrame && styles.heroTitleLandscape,
  ];
  const heroSubStyle: StyleProp<TextStyle> = [
    styles.sub,
    { fontSize: subSize },
    useLandscapeFrame && styles.heroSubLandscape,
  ];
  const segmentStyle: StyleProp<ViewStyle> = [
    styles.segment,
    useLandscapeFrame && styles.segmentLandscape,
  ];
  const segmentBtnLayout: ViewStyle = { height: segmentHeight };
  const segmentButtonStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.segmentBtn,
    segmentBtnLayout,
    active && styles.segmentBtnActive,
  ];
  const segmentTextStyle: StyleProp<TextStyle> = [
    styles.segmentText,
    { fontSize: segmentText },
  ];
  const segmentTextToneStyle = (active: boolean): StyleProp<TextStyle> => [
    segmentTextStyle,
    active && styles.segmentTextActive,
  ];
  const labelStyle: StyleProp<TextStyle> = [
    styles.label,
    { fontSize: labelSize },
  ];
  const inputLayout: TextStyle = { height: inputHeight, borderRadius: inputRadius };
  const inputStyle: StyleProp<TextStyle> = [styles.input, inputLayout];
  const inputInlineStyle: StyleProp<TextStyle> = [
    styles.input,
    styles.inputInline,
    inputLayout,
  ];
  const eyeBtnLayout: ViewStyle = {
    width: eyeBtnSize,
    height: eyeBtnSize,
    borderRadius: inputRadius,
  };
  const eyeBtnStyle: StyleProp<ViewStyle> = [styles.eyeBtn, eyeBtnLayout];
  const hintTextStyle: StyleProp<TextStyle> = [
    styles.hintText,
    { fontSize: hintSize },
  ];
  const hintLinkStyle: StyleProp<TextStyle> = [
    styles.hintLink,
    { fontSize: hintSize },
  ];
  const ctaStyle: StyleProp<ViewStyle> = [
    styles.cta,
    (!canContinue || emailAuthLoading) && styles.ctaDisabled,
  ];
  const ctaInnerLayout: ViewStyle = { height: ctaHeight };
  const ctaInnerStyle: StyleProp<ViewStyle> = [
    styles.ctaInner,
    ctaInnerLayout,
    !canContinue && { opacity: 0.6 },
  ];
  const ctaTextStyle: StyleProp<TextStyle> = [
    styles.ctaText,
    { fontSize: ctaText },
  ];
  const socialBtnLayout: ViewStyle = {
    height: socialHeight,
    borderRadius: Math.round(socialHeight * 0.3),
  };
  const socialButtonStyle = (disabled: boolean): StyleProp<ViewStyle> => [
    styles.socialBtn,
    socialBtnLayout,
    disabled && styles.socialBtnDisabled,
  ];
  const socialTextStyle: StyleProp<TextStyle> = [
    styles.socialText,
    { fontSize: segmentText },
  ];
  const skipTextStyle: StyleProp<TextStyle> = [
    styles.skipText,
    { fontSize: hintSize },
  ];
  const outerStyle: StyleProp<ViewStyle> = [
    styles.outer,
    { padding: gutter },
  ];
  const scrollContentStyle: StyleProp<ViewStyle> = [
    styles.scroll,
    isLandscape && {
      paddingVertical: scrollPad,
      minHeight: scrollMinHeight,
      justifyContent: "center",
    },
  ];
  const cardLayout: ViewStyle = {
    width: cardWidth,
    padding: landscapeCardPad,
    borderRadius: cardRadius,
  };
  const cardStyle: StyleProp<ViewStyle> = [styles.card, cardLayout];
  const heroColumnLayout: ViewStyle = {
    paddingRight: landscapeGap,
    paddingVertical: landscapeColumnPad,
  };
  const heroColumnStyle: StyleProp<ViewStyle> = [
    styles.heroColumn,
    heroColumnLayout,
  ];
  const formColumnLayout: ViewStyle = {
    paddingLeft: landscapeGap,
    paddingVertical: landscapeColumnPad,
  };
  const formColumnStyle: StyleProp<ViewStyle> = [
    styles.formColumn,
    formColumnLayout,
  ];

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
        if (result.type === "dismiss" || result.type === "cancel") {
          Alert.alert("Sign-in cancelled", "OAuth flow was canceled.");
        }
        return;
      }

      const params = getAuthRedirectParams(result.url);
      if (!params) {
        Alert.alert("Sign-in failed", "The provider returned an invalid URL.");
        return;
      }
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
        try {
          const homeName = profile.homeName?.trim() || `${userName}'s Home`;
          await bootstrapHome(homeName);
        } catch {
          // Ignore bootstrap errors (e.g., already has a home).
        }
        Alert.alert("Signed in", `Welcome back, ${userName}!`);
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
      const { error } = await supabase.auth.resetPasswordForEmail(safeEmail, {
        redirectTo: redirectUri,
      });
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

  const heroContent = (
    <>
      <View
        style={lottieWrapStyle}
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
      <Text style={heroTitleStyle}>
        VantaHome, connected.
      </Text>
      <Text style={heroSubStyle}>
        Create an account or sign in to sync devices, scenes, and automations.
      </Text>
    </>
  );

  const formContent = (
    <>
      <View style={segmentStyle}>
        {(["create", "login"] as const).map((k) => (
          <Pressable
            key={k}
            style={segmentButtonStyle(mode === k)}
            onPress={() => setMode(k)}
          >
            <Text style={segmentTextToneStyle(mode === k)}>
              {k === "create" ? "Create" : "Login"}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === "create" && (
        <View style={styles.field}>
          <Text style={labelStyle}>Full name</Text>
          <TextInput
            accessibilityLabel="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Nick Kerr"
            placeholderTextColor="rgba(12,12,18,0.35)"
            style={inputStyle}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>
      )}

      <View style={styles.field}>
        <Text style={labelStyle}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="rgba(12,12,18,0.35)"
          style={inputStyle}
          keyboardType="email-address"
          autoCapitalize="none"
          returnKeyType="next"
        />
      </View>

      <View style={styles.field}>
        <Text style={labelStyle}>Password</Text>
        <View style={styles.inputRow}>
          <TextInput
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="rgba(12,12,18,0.35)"
            style={inputInlineStyle}
            secureTextEntry={!showPassword}
            returnKeyType={mode === "create" ? "next" : "done"}
          />
          <Pressable
            accessibilityLabel={
              showPassword
                ? "Hide password"
                : "Show password"
            }
            accessibilityState={{ selected: showPassword }}
            style={eyeBtnStyle}
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
          <Text style={labelStyle}>Confirm password</Text>
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel="Confirm password"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="••••••••"
              placeholderTextColor="rgba(12,12,18,0.35)"
              style={inputInlineStyle}
              secureTextEntry={!showConfirm}
              returnKeyType="done"
            />
            <Pressable
              accessibilityLabel={
                showConfirm
                  ? "Hide confirmed password"
                  : "Show confirmed password"
              }
              accessibilityState={{ selected: showConfirm }}
              style={eyeBtnStyle}
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
        <Text style={hintTextStyle}>
          {mode === "create"
            ? "Password must be at least 6 characters."
            : "Forgot password?"}
        </Text>
        {mode === "login" && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send password reset email"
            onPress={handleResetPassword}
            disabled={resetLoading}
          >
            <Text style={hintLinkStyle}>
              {resetLoading ? "Sending…" : "Reset"}
            </Text>
          </Pressable>
        )}
      </View>

      <Pressable
        style={ctaStyle}
        onPress={handleContinue}
        disabled={!canContinue || emailAuthLoading}
      >
        <LinearGradient
          colors={["#B08CFF", "#6B3CFF"]}
          start={{ x: 0.1, y: 0.2 }}
          end={{ x: 0.9, y: 0.9 }}
          style={ctaInnerStyle}
        >
          {emailAuthLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={ctaTextStyle}>
                {mode === "create" ? "Create account" : "Sign in"}
              </Text>
              <Ionicons
                name="arrow-forward"
                size={Math.round(16 * scale)}
                color="#FFFFFF"
                style={styles.ctaArrow}
              />
            </>
          )}
        </LinearGradient>
      </Pressable>

      {(authProviders.apple || authProviders.google) && (
        <>
          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.orLine} />
          </View>

          <View style={styles.socialRow}>
            {authProviders.apple && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue with Apple"
                style={socialButtonStyle(Boolean(oauthLoading))}
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
                <Text style={socialTextStyle}>Apple</Text>
              </Pressable>
            )}
            {authProviders.google && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
                style={socialButtonStyle(Boolean(oauthLoading))}
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
                <Text style={socialTextStyle}>Google</Text>
              </Pressable>
            )}
          </View>
        </>
      )}

    </>
  );

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={outerStyle}
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
          style={styles.scrollView}
          contentContainerStyle={scrollContentStyle}
          showsVerticalScrollIndicator={false}
        >
          <LandscapeFrame
            enabled={useLandscapeFrame}
            width={frameWidth}
            pad={framePad}
            radius={frameRadius}
          >
            <View style={cardStyle}>
              {useLandscapeFrame ? (
                <View style={styles.cardLandscape}>
                  <View style={heroColumnStyle}>
                    {heroContent}
                  </View>
                  <View style={styles.heroDivider} />
                  <View style={formColumnStyle}>
                    {formContent}
                  </View>
                </View>
              ) : (
                <>
                  {heroContent}
                  {formContent}
                </>
              )}
            </View>
          </LandscapeFrame>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { flex: 1, justifyContent: "center" },
  scrollView: { flex: 1, width: "100%" },
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
  cardLandscape: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
  },
  heroColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  formColumn: { flex: 1.2, minWidth: 0 },
  heroDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(12,12,18,0.12)",
  },
  authLottieWrap: {
    alignSelf: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
  },
  authLottieWrapLandscape: { alignSelf: "flex-start" },
  authLottieBackdrop: { ...StyleSheet.absoluteFillObject },
  authLottie: { width: "100%", height: "100%", opacity: 1 },
  authLottieFade: { ...StyleSheet.absoluteFillObject },
  h1: { fontSize: 24, fontWeight: "900", color: "#0C0C12" },
  heroTitleLandscape: { textAlign: "left", maxWidth: 360 },
  sub: { marginTop: 6, color: "rgba(12,12,18,0.55)", fontWeight: "700" },
  heroSubLandscape: { textAlign: "left", maxWidth: 360, marginTop: 0 },
  segment: {
    flexDirection: "row",
    backgroundColor: "rgba(12,12,18,0.08)",
    borderRadius: 999,
    marginTop: 16,
    padding: 4,
  },
  segmentLandscape: { marginTop: 0 },
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
  ctaArrow: { marginLeft: 8, transform: [{ rotate: "-45deg" }] },
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
