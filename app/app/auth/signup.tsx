import { useRouter } from "expo-router";
import { useState } from "react";
import { AuthScreen, ErrorText, Field, LinkButton, PrimaryButton } from "@/components/auth-ui";
import { register } from "@/lib/auth";

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await register(email.trim(), password);
      // Show the recovery code once (root-level modal, outside the auth group).
      router.replace("/recovery-code");
    } catch (e: any) {
      setError(e?.message ?? "Could not create your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title="Create your account"
      subtitle="Your entries are end-to-end encrypted. We can never read them, so guard your password and recovery code."
    >
      <ErrorText>{error}</ErrorText>
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" placeholder="you@example.com" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" placeholder="At least 8 characters" />
      <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Re-enter password" />
      <PrimaryButton title="Create account" onPress={onSubmit} loading={busy} disabled={!email || !password || !confirm} />
      <LinkButton title="I already have an account" onPress={() => router.push("/auth/login")} />
    </AuthScreen>
  );
}
