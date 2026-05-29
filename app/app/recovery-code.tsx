import { Redirect, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { consumeRecoveryCode } from "@/lib/auth";

export default function RecoveryCodeScreen() {
  const router = useRouter();
  // Consume once on first render. On a web reload (nothing stashed) bounce home.
  const code = useRef(consumeRecoveryCode()).current;
  const [ack, setAck] = useState(false);

  if (!code) return <Redirect href="/" />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Save your recovery code</Text>
        <Text style={styles.body}>
          This is the only way to get back into your account if you forget your password.
          Because your data is end-to-end encrypted, we cannot reset it for you. If you lose
          both your password and this code, your data is gone for good.
        </Text>
        <Text style={styles.hint}>Write it down or store it in a password manager.</Text>

        <View style={styles.codeBox}>
          <Text selectable style={styles.code}>{code}</Text>
        </View>

        <TouchableOpacity style={styles.checkRow} onPress={() => setAck(!ack)} activeOpacity={0.8}>
          <View style={[styles.checkbox, ack && styles.checkboxOn]}>
            {ack ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <Text style={styles.checkLabel}>I've saved my recovery code somewhere safe</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, !ack && styles.buttonDisabled]}
          disabled={!ack}
          onPress={() => router.replace("/")}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  scroll: { padding: 24, paddingTop: 40, flexGrow: 1, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "800", color: "#111", marginBottom: 16, textAlign: "center" },
  body: { fontSize: 15, color: "#3c4043", lineHeight: 22, marginBottom: 12 },
  hint: { fontSize: 14, color: "#5f6368", fontWeight: "600", marginBottom: 20 },
  codeBox: { backgroundColor: "#f1f3f4", borderRadius: 12, padding: 18, marginBottom: 24, borderWidth: 1, borderColor: "#dadce0" },
  code: { fontFamily: "monospace", fontSize: 16, letterSpacing: 1, color: "#111", textAlign: "center", lineHeight: 26 },
  checkRow: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: "#1a73e8", marginRight: 12, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: "#1a73e8" },
  checkmark: { color: "#fff", fontWeight: "800", fontSize: 15 },
  checkLabel: { flex: 1, fontSize: 15, color: "#3c4043" },
  button: { height: 50, backgroundColor: "#1a73e8", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  buttonDisabled: { backgroundColor: "#a6c8f7" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
