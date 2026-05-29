import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/lib/auth";

export default function AuthLayout() {
  const { status } = useAuth();

  if (status === "loading") return null;
  if (status === "authenticated") return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
