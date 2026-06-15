import { useRouter } from "expo-router";
import { useState } from "react";
import { AuthScreen, ErrorText, Field, LinkButton, PrimaryButton, yieldToPaint } from "@/components/auth-ui";
import { register } from "@/lib/auth";

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    setError(null);
    if (password && password.length < 8) return setError("Password must be at least 8 characters (or leave it blank).");
    setBusy(true);
    await yieldToPaint(); // paint the spinner before Argon2id blocks the JS thread
    try {
      await register(email.trim(), password || undefined);
      // Show + confirm the recovery code (root-level, outside the auth group).
      router.replace("/recovery-code");
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Could not create your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title="Create your account"
      subtitle="Your data is end-to-end encrypted. You'll also get a private recovery code as a last-resort backup."
    >
      <ErrorText>{error}</ErrorText>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@example.com"
        returnKeyType="next"
      />
      <Field
        label="Password (optional)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        placeholder="Add a password, or skip it"
        returnKeyType="go"
        onSubmitEditing={() => { if (email) onCreate(); }}
      />
      <PrimaryButton title="Create account" onPress={onCreate} loading={busy} disabled={!email} />
      <LinkButton title="I already have an account" onPress={() => router.push("/auth/login")} />
    </AuthScreen>
  );
}
