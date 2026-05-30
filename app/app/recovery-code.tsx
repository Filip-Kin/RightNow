import { Redirect, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { consumeRecoveryCode } from "@/lib/auth";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

const hexOnly = (s: string) => s.replace(/[^0-9a-fA-F]/g, "").toLowerCase();

export default function RecoveryCodeScreen() {
  const router = useRouter();
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  // Consume once on first render. On a web reload (nothing stashed) bounce home.
  const code = useRef(consumeRecoveryCode()).current;

  const [step, setStep] = useState<"show" | "verify">("show");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!code) return <Redirect href="/" />;

  const firstFour = hexOnly(code).slice(0, 4);

  function onConfirm() {
    setError(null);
    if (hexOnly(confirm).slice(0, 4) !== firstFour) {
      setError("That doesn't match the start of your code. Check what you saved.");
      return;
    }
    router.replace("/");
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {step === "show" ? (
          <>
            <Text style={styles.title}>Save your recovery code</Text>
            <Text style={styles.body}>
              This is a last-resort way back into your account if you lose your other devices and your
              password. Your data is end-to-end encrypted, so we can't recover it for you.
            </Text>
            <Text style={styles.hint}>Write it down or store it in a password manager.</Text>
            <View style={styles.codeBox}>
              <Text selectable style={styles.code}>{code}</Text>
            </View>
            <TouchableOpacity style={styles.button} onPress={() => setStep("verify")} activeOpacity={0.85}>
              <Text style={styles.buttonText}>I've saved it</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Confirm you saved it</Text>
            <Text style={styles.body}>Type the first 4 characters of your recovery code.</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              maxLength={5}
              placeholder="e.g. A1B2"
              placeholderTextColor={c.textFaint}
              returnKeyType="go"
              onSubmitEditing={onConfirm}
            />
            <TouchableOpacity
              style={[styles.button, hexOnly(confirm).length < 4 && styles.buttonDisabled]}
              disabled={hexOnly(confirm).length < 4}
              onPress={onConfirm}
            >
              <Text style={styles.buttonText}>Confirm &amp; continue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={() => setStep("show")}>
              <Text style={styles.link}>Show my code again</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 24, paddingTop: 40, flexGrow: 1, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "800", color: c.text, marginBottom: 16, textAlign: "center" },
  body: { fontSize: 15, color: c.textBody, lineHeight: 22, marginBottom: 12 },
  hint: { fontSize: 14, color: c.textMuted, fontWeight: "600", marginBottom: 20 },
  codeBox: { backgroundColor: c.surface, borderRadius: 12, padding: 18, marginBottom: 24, borderWidth: 1, borderColor: c.border },
  code: { fontFamily: "monospace", fontSize: 16, letterSpacing: 1, color: c.text, textAlign: "center", lineHeight: 26 },
  input: { height: 48, borderColor: c.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 16, color: c.text, backgroundColor: c.inputBg, marginBottom: 14 },
  button: { height: 50, backgroundColor: c.primary, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 4 },
  buttonDisabled: { backgroundColor: c.primaryDisabled },
  buttonText: { color: c.onPrimary, fontSize: 16, fontWeight: "700" },
  linkBtn: { paddingVertical: 12, alignItems: "center" },
  link: { color: c.primary, fontSize: 14, fontWeight: "600" },
  error: { color: c.danger, fontSize: 14, marginBottom: 12, textAlign: "center" },
});
