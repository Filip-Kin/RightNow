// Small shared primitives for the auth screens, so login/signup/recovery look
// consistent without repeating styling. Themed (light/dark) via useThemedStyles.
import React from "react";
import {
    ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
    StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

export function AuthScreen({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    const styles = useThemedStyles(makeStyles);
    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <Text style={styles.brand}>RightNow</Text>
                    <Text style={styles.title}>{title}</Text>
                    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                    <View style={{ height: 16 }} />
                    {children}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
    const c = useTheme();
    const styles = useThemedStyles(makeStyles);
    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                style={styles.input}
                placeholderTextColor={c.textFaint}
                selectionColor={c.primary}
                autoCapitalize="none"
                autoCorrect={false}
                {...props}
            />
        </View>
    );
}

export function PrimaryButton({ title, onPress, loading, disabled }: { title: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
    const c = useTheme();
    const styles = useThemedStyles(makeStyles);
    const off = loading || disabled;
    return (
        <TouchableOpacity
            style={[styles.button, off && styles.buttonDisabled]}
            onPress={onPress}
            disabled={off}
            activeOpacity={0.85}
        >
            {loading ? <ActivityIndicator color={c.onPrimary} /> : <Text style={styles.buttonText}>{title}</Text>}
        </TouchableOpacity>
    );
}

export function LinkButton({ title, onPress }: { title: string; onPress: () => void }) {
    const styles = useThemedStyles(makeStyles);
    return (
        <TouchableOpacity onPress={onPress} style={{ paddingVertical: 10 }}>
            <Text style={styles.link}>{title}</Text>
        </TouchableOpacity>
    );
}

export function ErrorText({ children }: { children?: string | null }) {
    const styles = useThemedStyles(makeStyles);
    if (!children) return null;
    return <Text style={styles.error}>{children}</Text>;
}

/** A "or <label>" separator with hairlines either side. */
export function OrDivider({ label }: { label: string }) {
    const styles = useThemedStyles(makeStyles);
    return (
        <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{label}</Text>
            <View style={styles.dividerLine} />
        </View>
    );
}

/** Resolve after the next paint so a just-set busy state (spinner) renders before
 *  a synchronous, thread-blocking call (Argon2id) runs. Double rAF guarantees the
 *  busy frame is committed first. */
export function yieldToPaint(): Promise<void> {
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

const makeStyles = (c: Colors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    scroll: { padding: 24, paddingTop: 48, flexGrow: 1, justifyContent: "center" },
    brand: { fontSize: 34, fontWeight: "800", textAlign: "center", color: c.text },
    title: { fontSize: 20, fontWeight: "700", textAlign: "center", marginTop: 24, color: c.text },
    subtitle: { fontSize: 14, textAlign: "center", marginTop: 8, color: c.textMuted, lineHeight: 20 },
    label: { fontSize: 13, fontWeight: "600", marginBottom: 6, color: c.textBody },
    input: {
        height: 48, borderColor: c.border, borderWidth: 1, borderRadius: 10,
        paddingHorizontal: 14, fontSize: 16, color: c.text, backgroundColor: c.inputBg,
    },
    button: {
        height: 50, backgroundColor: c.primary, borderRadius: 10,
        alignItems: "center", justifyContent: "center", marginTop: 8,
    },
    buttonDisabled: { backgroundColor: c.primaryDisabled },
    buttonText: { color: c.onPrimary, fontSize: 16, fontWeight: "700" },
    link: { color: c.primary, textAlign: "center", fontSize: 14, fontWeight: "600" },
    error: { color: c.danger, fontSize: 14, marginBottom: 12, textAlign: "center" },
    divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 18 },
    dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.border },
    dividerText: { fontSize: 13, color: c.textMuted, fontWeight: "600" },
});
