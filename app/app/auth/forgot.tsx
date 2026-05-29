import { useRouter } from "expo-router";
import { useState } from "react";
import { AuthScreen, ErrorText, Field, LinkButton, PrimaryButton } from "@/components/auth-ui";
import { recoverAndReset } from "@/lib/auth";

export default function ForgotScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
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
      await recoverAndReset(email.trim(), recoveryCode, password);
      // recoverAndReset signs in with the new password; the layout redirects home.
    } catch (e: any) {
      setError(e?.message ?? "Could not verify that recovery code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title="Reset your password"
      subtitle="Enter the recovery code you saved at signup to set a new password. Your encrypted data stays intact."
    >
      <ErrorText>{error}</ErrorText>
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />
      <Field label="Recovery code" value={recoveryCode} onChangeText={setRecoveryCode} placeholder="XXXX-XXXX-..." autoCapitalize="characters" />
      <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" placeholder="At least 8 characters" />
      <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Re-enter password" />
      <PrimaryButton title="Reset password" onPress={onSubmit} loading={busy} disabled={!email || !recoveryCode || !password || !confirm} />
      <LinkButton title="Back to sign in" onPress={() => router.push("/auth/login")} />
    </AuthScreen>
  );
}
