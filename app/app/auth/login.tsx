import { useRouter } from "expo-router";
import { useState } from "react";
import { AuthScreen, ErrorText, Field, LinkButton, PrimaryButton } from "@/components/auth-ui";
import { login, signInWithCode } from "@/lib/auth";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pw" | "code" | null>(null);

  async function onPassword() {
    setError(null);
    setBusy("pw");
    try {
      await login(email.trim(), password);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally {
      setBusy(null);
    }
  }

  async function onCode() {
    setError(null);
    setBusy("code");
    try {
      await signInWithCode(code);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "That recovery code didn't work.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AuthScreen title="Sign in" subtitle="Sign in instantly from a device you're already on, or use your email + password.">
      <ErrorText>{error}</ErrorText>

      {/* Primary: QR from another signed-in device. */}
      <PrimaryButton title="Sign in with another device (QR)" onPress={() => router.push("/auth/link")} />

      {/* Backup: email + password. */}
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" placeholder="you@example.com" returnKeyType="next" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" placeholder="Your password" returnKeyType="go" onSubmitEditing={() => { if (email && password) onPassword(); }} />
      <PrimaryButton title="Sign in with email & password" onPress={onPassword} loading={busy === "pw"} disabled={!email || !password} />

      {/* Last resort: recovery code, hidden until the others are exhausted. */}
      {showCode ? (
        <>
          <Field label="Recovery code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="XXXX-XXXX-XXXX-…" returnKeyType="go" onSubmitEditing={() => { if (code) onCode(); }} />
          <PrimaryButton title="Sign in with recovery code" onPress={onCode} loading={busy === "code"} disabled={!code} />
        </>
      ) : (
        <LinkButton title="Can't use those? Use your recovery code" onPress={() => setShowCode(true)} />
      )}

      <LinkButton title="Create an account" onPress={() => router.push("/auth/signup")} />
    </AuthScreen>
  );
}
