import { useRouter } from "expo-router";
import { useState } from "react";
import { AuthScreen, ErrorText, LinkButton, PrimaryButton } from "@/components/auth-ui";
import { createAnonymousAccount } from "@/lib/auth";

export default function SignupScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    setError(null);
    setBusy(true);
    try {
      await createAnonymousAccount();
      // Show + verify the recovery code (root-level, outside the auth group).
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
      subtitle="No email or password needed. Your data is end-to-end encrypted - we generate a private recovery code that only you hold. You can add an email + password backup afterward."
    >
      <ErrorText>{error}</ErrorText>
      <PrimaryButton title="Create account" onPress={onCreate} loading={busy} />
      <LinkButton title="I already have an account" onPress={() => router.push("/auth/login")} />
    </AuthScreen>
  );
}
