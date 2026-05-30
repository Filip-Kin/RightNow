import { useRouter } from "expo-router";
import { useState } from "react";
import { AuthScreen, ErrorText, Field, LinkButton, PrimaryButton } from "@/components/auth-ui";
import { login, signInWithCode } from "@/lib/auth";

export default function LoginScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"code" | "pw" | null>(null);

  async function onCode() {
    setError(null);
    setBusy("code");
    try {
      await signInWithCode(code);
      // The auth-group layout redirects to "/" once authenticated.
    } catch (e: any) {
      setError(e?.message ?? "That recovery code didn't work.");
    } finally {
      setBusy(null);
    }
  }

  async function onPassword() {
    setError(null);
    setBusy("pw");
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      setError(e?.message ?? "Could not sign in.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AuthScreen title="Sign in" subtitle="Use your recovery code, another signed-in device, or your email + password backup.">
      <ErrorText>{error}</ErrorText>

      <Field
        label="Recovery code"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        placeholder="XXXX-XXXX-XXXX-…"
      />
      <PrimaryButton title="Sign in with recovery code" onPress={onCode} loading={busy === "code"} disabled={!code} />

      <LinkButton title="Sign in with another device (QR)" onPress={() => router.push("/auth/link")} />

      {showPw ? (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" placeholder="you@example.com" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" placeholder="Your password" />
          <PrimaryButton title="Sign in with email & password" onPress={onPassword} loading={busy === "pw"} disabled={!email || !password} />
        </>
      ) : (
        <LinkButton title="Use email & password backup" onPress={() => setShowPw(true)} />
      )}

      <LinkButton title="Create an account" onPress={() => router.push("/auth/signup")} />
    </AuthScreen>
  );
}
