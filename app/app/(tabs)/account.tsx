// Manage the optional email + password backup for the (otherwise anonymous) account.
import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/ScreenContainer";
import { addEmailPasswordBackup } from "@/lib/auth";
import { trpc } from "@/lib/trpc";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

export default function AccountScreen() {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [current, setCurrent] = useState<string | null | undefined>(undefined); // undefined = loading
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trpc.auth.backupStatus.query().then((r) => setCurrent(r.email)).catch(() => setCurrent(null));
  }, []);

  async function save() {
    setError(null); setMsg(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    setBusy(true);
    try {
      await addEmailPasswordBackup(email, password);
      setCurrent(email.trim());
      setEmail(""); setPassword("");
      setMsg("Backup saved. You can now sign in with this email + password too.");
    } catch (e: any) {
      setError(e?.message ?? "Could not save backup.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenContainer maxWidth={640}>
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={styles.hint}>
            Your account is anonymous - the recovery code is your real credential. Optionally add an
            email + password as a memorable backup way to sign in if you ever lose the code.
          </Text>

          <View style={styles.statusBox}>
            <Text style={styles.statusLabel}>Backup login</Text>
            <Text style={styles.statusValue}>
              {current === undefined ? "…" : current ? `Set · ${current}` : "Not set"}
            </Text>
          </View>

          <Text style={styles.label}>{current ? "Change email + password" : "Add email + password"}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="you@example.com"
            placeholderTextColor={c.textFaint}
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password (at least 8 characters)"
            placeholderTextColor={c.textFaint}
          />
          <TouchableOpacity
            style={[styles.button, (!email || password.length < 8 || busy) && styles.disabled]}
            disabled={!email || password.length < 8 || busy}
            onPress={save}
          >
            {busy ? <ActivityIndicator color={c.onPrimary} /> : <Text style={styles.buttonText}>{current ? "Update backup" : "Save backup"}</Text>}
          </TouchableOpacity>

          {error && <Text style={styles.errorText}>{error}</Text>}
          {msg && <View style={styles.resultBox}><Text style={styles.resultText}>{msg}</Text></View>}
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  hint: { color: c.textMuted, fontSize: 13, marginBottom: 16, lineHeight: 18 },
  statusBox: { backgroundColor: c.surface, borderRadius: 10, padding: 14, marginBottom: 16 },
  statusLabel: { color: c.textMuted, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  statusValue: { color: c.text, fontSize: 16, fontWeight: "700", marginTop: 4 },
  label: { fontSize: 16, fontWeight: "bold", marginBottom: 8, color: c.textBody },
  input: { height: 48, borderColor: c.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 16, color: c.text, backgroundColor: c.card, marginBottom: 14 },
  button: { height: 50, backgroundColor: c.primary, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.6 },
  buttonText: { color: c.onPrimary, fontSize: 16, fontWeight: "700" },
  errorText: { color: c.danger, marginTop: 14, fontSize: 14 },
  resultBox: { marginTop: 16, padding: 14, backgroundColor: c.successSoft, borderRadius: 8 },
  resultText: { color: c.successText, fontSize: 15, fontWeight: "600" },
});
