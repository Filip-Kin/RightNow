// "Delete data or account" (Settings -> Delete data or account). Two destructive
// tools: bulk-delete a date range of entries (e.g. a whole year), and permanently
// delete the entire account. Both confirm first.
import { useMemo, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Icon } from "@/components/Icon";
import { useEntries, countInRange, deleteRange } from "@/lib/entries";
import { deleteAccount } from "@/lib/auth";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

function confirmAsync(title: string, message: string, destructiveLabel: string): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(`${title}\n\n${message}`) : false);
  }
  return new Promise((resolve) => Alert.alert(title, message, [
    { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
    { text: destructiveLabel, style: "destructive", onPress: () => resolve(true) },
  ]));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function DeleteDataScreen() {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const entries = useEntries(); // reactive: re-renders (and re-counts) after a delete
  const now = new Date();

  // Year range from the earliest logged entry to this year.
  const minYear = useMemo(() => {
    let y = now.getFullYear();
    for (const e of entries) { const ey = Number(e.date.split("-")[0]); if (ey < y) y = ey; }
    return y;
  }, [entries, now]);
  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = minYear; y <= now.getFullYear(); y++) out.push(y);
    return out;
  }, [minYear, now]);

  const [sY, setSY] = useState(minYear);
  const [sM, setSM] = useState(1);
  const [sD, setSD] = useState(1);
  const [eY, setEY] = useState(now.getFullYear());
  const [eM, setEM] = useState(now.getMonth() + 1);
  const [eD, setED] = useState(now.getDate());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const start = `${sY}-${sM}-${sD}`;
  const end = `${eY}-${eM}-${eD}`;
  const count = countInRange(start, end);

  async function onDeleteRange() {
    setMsg(null);
    if (count === 0) { setMsg("No entries in that range."); return; }
    const ok = await confirmAsync(
      "Delete this range?",
      `This permanently deletes ${count} entr${count === 1 ? "y" : "ies"} and note(s) from ${MONTHS[sM - 1]} ${sD}, ${sY} to ${MONTHS[eM - 1]} ${eD}, ${eY}. This can't be undone.`,
      "Delete",
    );
    if (!ok) return;
    setBusy(true);
    try {
      const n = await deleteRange(start, end);
      setMsg(`Deleted ${n} item${n === 1 ? "" : "s"}.`);
    } catch (e) {
      console.error(e);
      setMsg(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteAccount() {
    const ok = await confirmAsync(
      "Delete account?",
      "This permanently deletes your account and ALL your data from the server. It can't be undone - export a backup first if you want to keep your data.",
      "Delete account",
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deleteAccount(); // signs out; the app redirects to login
    } catch (e) {
      console.error(e);
      setBusy(false);
      Alert.alert("Couldn't delete account", e instanceof Error ? e.message : "Please try again.");
    }
  }

  const DateRow = ({ y, m, d, setY, setM, setD }: {
    y: number; m: number; d: number;
    setY: (n: number) => void; setM: (n: number) => void; setD: (n: number) => void;
  }) => (
    <View style={styles.dateRow}>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={y} onValueChange={setY} style={styles.picker} dropdownIconColor={c.textBody} mode="dropdown">
          {years.map((yy) => <Picker.Item key={yy} label={String(yy)} value={yy} color={c.text} />)}
        </Picker>
      </View>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={m} onValueChange={setM} style={styles.picker} dropdownIconColor={c.textBody} mode="dropdown">
          {MONTHS.map((mm, i) => <Picker.Item key={mm} label={mm} value={i + 1} color={c.text} />)}
        </Picker>
      </View>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={d} onValueChange={setD} style={styles.picker} dropdownIconColor={c.textBody} mode="dropdown">
          {Array.from({ length: 31 }, (_, i) => i + 1).map((dd) => <Picker.Item key={dd} label={String(dd)} value={dd} color={c.text} />)}
        </Picker>
      </View>
    </View>
  );

  return (
    <ScreenContainer maxWidth={640}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={12}>
            <Icon name="arrow-back" style={{ color: c.text }} />
          </TouchableOpacity>
          <Text style={styles.title}>Delete data or account</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionLabel}>Delete a date range</Text>
          <Text style={styles.hint}>Permanently delete every logged hour and note between two dates - e.g. clear out a whole year.</Text>

          <Text style={styles.fieldLabel}>From</Text>
          <DateRow y={sY} m={sM} d={sD} setY={setSY} setM={setSM} setD={setSD} />
          <Text style={styles.fieldLabel}>To</Text>
          <DateRow y={eY} m={eM} d={eD} setY={setEY} setM={setEM} setD={setED} />

          <Text style={styles.count}>{count} item{count === 1 ? "" : "s"} in this range</Text>
          <TouchableOpacity style={[styles.dangerBtn, busy && styles.disabled]} onPress={onDeleteRange} disabled={busy}>
            <Text style={styles.dangerText}>Delete this range</Text>
          </TouchableOpacity>

          {msg && <Text style={styles.msg}>{msg}</Text>}

          <View style={styles.divider} />

          <Text style={styles.sectionLabel}>Delete account</Text>
          <Text style={styles.hint}>Permanently delete your account and all of your data from the server. This can't be undone.</Text>
          <TouchableOpacity style={[styles.dangerOutline, busy && styles.disabled]} onPress={onDeleteAccount} disabled={busy}>
            <Text style={styles.dangerOutlineText}>Delete my account</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 22, fontWeight: "800", color: c.text },
  scroll: { paddingHorizontal: 16, paddingBottom: 48 },
  sectionLabel: { fontSize: 17, fontWeight: "700", color: c.text, marginTop: 12, marginBottom: 6 },
  hint: { color: c.textMuted, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  fieldLabel: { color: c.textBody, fontSize: 13, fontWeight: "600", marginTop: 6, marginBottom: 2 },
  dateRow: { flexDirection: "row", gap: 8 },
  pickerWrap: { flex: 1, backgroundColor: c.surface, borderRadius: 8, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  picker: { color: c.text },
  count: { color: c.textMuted, fontSize: 14, marginTop: 16, marginBottom: 8 },
  dangerBtn: { backgroundColor: c.danger, borderRadius: 8, paddingVertical: 13, alignItems: "center" },
  dangerText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  dangerOutline: { borderWidth: 1, borderColor: c.danger, borderRadius: 8, paddingVertical: 13, alignItems: "center" },
  dangerOutlineText: { color: c.danger, fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.5 },
  msg: { color: c.textBody, fontSize: 14, marginTop: 12 },
  divider: { height: 1, backgroundColor: c.cardBorder, marginVertical: 28 },
});
