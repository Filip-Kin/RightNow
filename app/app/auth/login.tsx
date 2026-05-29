import { useRouter } from "expo-router";
import { useState } from "react";
import { AuthScreen, ErrorText, Field, LinkButton, PrimaryButton } from "@/components/auth-ui";
import { login } from "@/lib/auth";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      // The auth-group layout redirects to "/" once authenticated.
    } catch (e: any) {
      setError(e?.message ?? "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen title="Sign in">
      <ErrorText>{error}</ErrorText>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@example.com"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        placeholder="Your password"
      />
      <PrimaryButton title="Sign in" onPress={onSubmit} loading={busy} disabled={!email || !password} />
      <LinkButton title="Forgot password?" onPress={() => router.push("/auth/forgot")} />
      <LinkButton title="Create an account" onPress={() => router.push("/auth/signup")} />
    </AuthScreen>
  );
}
