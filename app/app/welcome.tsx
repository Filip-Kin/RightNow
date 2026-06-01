import { Redirect, useRouter } from "expo-router";
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinkButton, PrimaryButton } from "@/components/auth-ui";
import { useAuth } from "@/lib/auth";
import { useThemedStyles, type Colors } from "@/lib/theme";

// Filled in once beta distribution is live (Part C).
const TESTFLIGHT_URL = "";
const PLAY_URL = "";

export default function Welcome() {
  const router = useRouter();
  const { status } = useAuth();
  const styles = useThemedStyles(makeStyles);

  if (status === "loading") return null;
  if (status === "authenticated") return <Redirect href="/" />;

  const isWeb = Platform.OS === "web";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.hero}>
        <Text style={styles.brand}>RightNow</Text>
        <Text style={styles.tagline}>
          Track how you spend your hours and how you feel.
        </Text>
        <Text style={styles.privacy}>
          End-to-end encrypted. Your entries are unreadable to anyone but you, including us.
        </Text>
      </View>

      <View style={styles.actions}>
        <PrimaryButton title="Create account" onPress={() => router.push("/auth/signup")} />
        <LinkButton title="I already have an account" onPress={() => router.push("/auth/login")} />
      </View>

      {isWeb && (
        <View style={styles.download}>
          <Text style={styles.downloadLabel}>Get the app</Text>
          <View style={styles.badges}>
            <StoreBadge label="iOS · TestFlight" url={TESTFLIGHT_URL} />
            <StoreBadge label="Android · Play" url={PLAY_URL} />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function StoreBadge({ label, url }: { label: string; url: string }) {
  const styles = useThemedStyles(makeStyles);
  const enabled = url.length > 0;
  return (
    <TouchableOpacity
      style={[styles.badge, !enabled && styles.badgeDisabled]}
      disabled={!enabled}
      onPress={() => url && Linking.openURL(url)}
      activeOpacity={0.85}
    >
      <Text style={styles.badgeText}>{label}{enabled ? "" : " - soon"}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg, padding: 24, justifyContent: "center", maxWidth: 520, width: "100%", alignSelf: "center" },
  hero: { marginBottom: 40 },
  brand: { fontSize: 44, fontWeight: "800", color: c.text, textAlign: "center" },
  tagline: { fontSize: 18, color: c.textBody, textAlign: "center", marginTop: 16, lineHeight: 26 },
  privacy: { fontSize: 14, color: c.textMuted, textAlign: "center", marginTop: 16, lineHeight: 20 },
  actions: { marginBottom: 36 },
  download: { alignItems: "center" },
  downloadLabel: { fontSize: 13, fontWeight: "700", color: c.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 },
  badges: { flexDirection: "row", gap: 12, flexWrap: "wrap", justifyContent: "center" },
  badge: { borderWidth: 1, borderColor: c.text, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18 },
  badgeDisabled: { borderColor: c.border },
  badgeText: { fontSize: 15, fontWeight: "600", color: c.text },
});
