// Shown when a timezone change of flight size (>=90min) is detected, or while a
// trip is in progress. Lets the user say whether they're flying out, have just
// arrived, or it was a ground crossing; resolution (resampling transit onto the
// grid) happens in lib/timezone.ts.
import { Redirect, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { resolveTravel, useTzStatus } from "@/lib/timezone";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

export default function TravelScreen() {
  const router = useRouter();
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { pending, transit } = useTzStatus();

  // Nothing to resolve (e.g. a web reload of the route) -> leave.
  if (!pending && !transit) return <Redirect href="/" />;

  function done() {
    if (router.canDismiss()) router.dismiss();
    else router.replace("/");
  }
  async function choose(answer: "flying" | "arrived" | "landed" | "drove") {
    await resolveTravel(answer);
    done();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {transit ? (
          <>
            <Text style={styles.title}>You're traveling</Text>
            <Text style={styles.body}>
              Keep logging as normal during your trip - on your phone or watch. When you land, tap
              below and we'll fit what you logged onto your timeline in your new local time.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => choose("landed")}>
              <Text style={styles.primaryText}>I've landed</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={done}>
              <Text style={styles.ghostText}>Still traveling</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Your timezone changed</Text>
            <Text style={styles.body}>
              RightNow keeps your timeline in local time. Tell us what happened so the travel hours
              land cleanly instead of leaving a gap.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => choose("flying")}>
              <Text style={styles.primaryText}>I'm flying somewhere</Text>
              <Text style={styles.primarySub}>Keep logging in flight; I'll tap when I land</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.choiceBtn} onPress={() => choose("arrived")}>
              <Text style={styles.choiceText}>I just arrived</Text>
              <Text style={styles.choiceSub}>Fill the travel gap now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => choose("drove")}>
              <Text style={styles.ghostText}>I drove / no trip</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 24, gap: 12, flexGrow: 1, justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "800", color: c.text, marginBottom: 4 },
  body: { fontSize: 15, lineHeight: 21, color: c.textBody, marginBottom: 12 },
  primaryBtn: { backgroundColor: c.primary, borderRadius: 12, padding: 16 },
  primaryText: { color: c.onPrimary, fontSize: 17, fontWeight: "700" },
  primarySub: { color: c.onPrimary, fontSize: 12, opacity: 0.85, marginTop: 2 },
  choiceBtn: { backgroundColor: c.card, borderWidth: 1, borderColor: c.cardBorder, borderRadius: 12, padding: 16 },
  choiceText: { color: c.text, fontSize: 17, fontWeight: "700" },
  choiceSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  ghostBtn: { padding: 14, alignItems: "center" },
  ghostText: { color: c.textMuted, fontSize: 15, fontWeight: "600" },
});
