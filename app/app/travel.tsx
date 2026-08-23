// Shown when a timezone change of flight size (>=90min) is detected, or while a
// trip is in progress. Lets the user say whether they're flying out, have just
// arrived, or it was a ground crossing; resolution (resampling transit onto the
// grid) happens in lib/timezone.ts.
import { Redirect, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { resolveTravel, useTzStatus } from "@/lib/timezone";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

export default function TravelScreen() {
  const router = useRouter();
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { pending } = useTzStatus();

  // This screen is ONLY the auto-detect prompt now (a flight-size timezone change was
  // detected). Starting and ending travel manually is a toggle in Settings, so there
  // is no trapping "you're traveling" screen. Nothing pending -> leave.
  if (!pending) return <Redirect href="/" />;

  function done() {
    if (router.canDismiss()) router.dismiss();
    else router.replace("/");
  }
  async function choose(answer: "flying" | "arrived" | "drove") {
    await resolveTravel(answer);
    done();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Your timezone changed</Text>
        <Text style={styles.body}>
          RightNow keeps your timeline in local time. Tell us what happened so your travel hours fit
          cleanly onto the grid instead of leaving a gap.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => choose("flying")}>
          <Text style={styles.primaryText}>I'm flying somewhere</Text>
          <Text style={styles.primarySub}>Keep logging as normal; turn travel mode off in Settings when you arrive</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.choiceBtn} onPress={() => choose("arrived")}>
          <Text style={styles.choiceText}>I just arrived</Text>
          <Text style={styles.choiceSub}>Fit my travel hours onto the grid now</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => choose("drove")}>
          <Text style={styles.ghostText}>I drove / no trip</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 24, gap: 12, flexGrow: 1, justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "800", color: c.text, marginBottom: 4 },
  body: { fontSize: 15, lineHeight: 21, color: c.textBody, marginBottom: 12 },
  note: { fontSize: 13, lineHeight: 19, color: c.textMuted, fontStyle: "italic", marginBottom: 16 },
  primaryBtn: { backgroundColor: c.primary, borderRadius: 12, padding: 16 },
  primaryText: { color: c.onPrimary, fontSize: 17, fontWeight: "700" },
  primarySub: { color: c.onPrimary, fontSize: 12, opacity: 0.85, marginTop: 2 },
  choiceBtn: { backgroundColor: c.card, borderWidth: 1, borderColor: c.cardBorder, borderRadius: 12, padding: 16 },
  choiceText: { color: c.text, fontSize: 17, fontWeight: "700" },
  choiceSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  ghostBtn: { padding: 14, alignItems: "center" },
  ghostText: { color: c.textMuted, fontSize: 15, fontWeight: "600" },
});
