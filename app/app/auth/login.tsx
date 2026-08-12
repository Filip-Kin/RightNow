import { useRouter } from "expo-router";
import { useState } from "react";
import { AuthScreen, ErrorText, Field, LinkButton, OrDivider, PrimaryButton, yieldToPaint } from "@/components/auth-ui";
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
    await yieldToPaint(); // paint the spinner before Argon2id blocks the JS thread
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
    await yieldToPaint(); // paint the spinner before Argon2id blocks the JS thread
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
      <PrimaryButton title="Sign in with another device (QR)" onPress={() => router.push("/auth/link")} disabled={busy !== null} />

      <OrDivider label="or use email & password" />

      {/* Backup: email + password. Inputs lock while a sign-in is in flight (the
          Argon2id derive can take a few seconds) so it's clear something's happening. */}
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" placeholder="you@example.com" returnKeyType="next" editable={busy === null} />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" placeholder="Your password" returnKeyType="go" onSubmitEditing={() => { if (email && password) onPassword(); }} editable={busy === null} />
      <PrimaryButton title="Sign in with email & password" onPress={onPassword} loading={busy === "pw"} disabled={!email || !password || busy !== null} />

      {/* Last resort: recovery code, hidden until the others are exhausted. */}
      {showCode ? (
        <>
          <Field label="Recovery code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="XXXX-XXXX-XXXX-…" returnKeyType="go" onSubmitEditing={() => { if (code) onCode(); }} editable={busy === null} />
          <PrimaryButton title="Sign in with recovery code" onPress={onCode} loading={busy === "code"} disabled={!code || busy !== null} />
        </>
      ) : (
        <LinkButton title="Can't use those? Use your recovery code" onPress={() => setShowCode(true)} />
      )}

      <LinkButton title="Create an account" onPress={() => router.push("/auth/signup")} />
      <LinkButton title="Privacy policy" onPress={() => router.push("/privacy")} />
    </AuthScreen>
  );
}
