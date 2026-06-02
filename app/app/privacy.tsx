// Privacy policy. Reachable in-app (linked from the login screen and Settings) and,
// because Expo Router maps it to /privacy on web, at https://rightnow.filipkin.com/privacy
// - which is the URL given to the Play Console. Not behind the auth gate (it's a
// top-level route, linked from login).
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Icon } from "@/components/Icon";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

const UPDATED = "June 1, 2026";
const CONTACT = "me@filipkin.com";

const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "The short version",
    body:
      "RightNow is end-to-end encrypted. Everything you log - your hours, activities, moods, and notes - is encrypted on your device before it leaves it. Our server stores only unreadable ciphertext and opaque identifiers. We cannot read your data, and neither can anyone who gains access to the server.",
  },
  {
    heading: "Account credentials",
    body:
      "When you create an account you receive a recovery code generated on your device. You may optionally add an email and password as a backup way to sign in. We never receive your password or recovery code - the app sends only a non-reversible token derived from them, and your encryption key is stored wrapped by a key that only you hold. If you add an email, we store it so you can sign in with it.",
  },
  {
    heading: "Your entries, notes, and activities",
    body:
      "These are encrypted on your device (XChaCha20-Poly1305) before syncing. The server receives only ciphertext and an HMAC-based cell identifier it cannot interpret - it never learns the date, hour, activity, mood, or text of anything you log. This data is used solely to sync your information across your own devices.",
  },
  {
    heading: "Health Connect (sleep)",
    body:
      "If you enable Sleep auto-fill on Android, the app reads your sleep sessions from Health Connect on your device to mark your sleeping hours. That sleep information is used only on your device to create sleep entries, which are end-to-end encrypted like everything else before any sync. We do not transmit your Health Connect data in readable form, do not share it with anyone, and never use it for advertising. You can revoke this access at any time in Health Connect or Android settings. Our use of Health Connect complies with the Health Connect Permissions policy and Google Play's User Data and Limited Use requirements.",
  },
  {
    heading: "Technical data",
    body:
      "We keep a session token so you stay signed in, and your IP address is used transiently to rate-limit abuse of the sign-in endpoints. RightNow contains no advertising SDKs, no analytics trackers, and no third-party profiling.",
  },
  {
    heading: "How your data is used",
    body:
      "Only to provide the app: store and sync your encrypted entries, authenticate you, and optionally auto-fill sleep. We do not sell or share your personal data with third parties, and we do not use it for advertising.",
  },
  {
    heading: "Storage, retention, and your choices",
    body:
      "Encrypted data is stored on our hosted server until you delete it or your account. Your decrypted data and your encryption key live only on your devices. At any time you can export a full backup, remove the optional email/password backup, revoke Health Connect access, and delete your account along with all server-side data.",
  },
  {
    heading: "Children",
    body:
      "RightNow is not directed at children under 13, and we do not knowingly collect personal information from them.",
  },
  {
    heading: "Changes",
    body:
      "If we make material changes to this policy we will update this page and the date above.",
  },
  {
    heading: "Contact",
    body: `Questions about privacy? Email ${CONTACT}.`,
  },
];

export default function PrivacyScreen() {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  return (
    <ScreenContainer maxWidth={720}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={12}>
            <Icon name="arrow-back" style={{ color: c.text }} />
          </TouchableOpacity>
          <Text style={styles.title}>Privacy Policy</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.updated}>Last updated: {UPDATED}</Text>
          {SECTIONS.map((s) => (
            <View key={s.heading} style={styles.section}>
              <Text style={styles.heading}>{s.heading}</Text>
              <Text style={styles.body}>{s.body}</Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 22, fontWeight: "800", color: c.text },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  updated: { color: c.textMuted, fontSize: 13, marginBottom: 16 },
  section: { marginBottom: 18 },
  heading: { fontSize: 16, fontWeight: "700", color: c.text, marginBottom: 6 },
  body: { fontSize: 14, color: c.textBody, lineHeight: 21 },
});
