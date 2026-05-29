// Small shared primitives for the auth screens, so login/signup/recovery look
// consistent without repeating styling.
import React from "react";
import {
    ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
    StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function AuthScreen({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
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
    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                style={styles.input}
                placeholderTextColor="#9aa0a6"
                autoCapitalize="none"
                autoCorrect={false}
                {...props}
            />
        </View>
    );
}

export function PrimaryButton({ title, onPress, loading, disabled }: { title: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
    const off = loading || disabled;
    return (
        <TouchableOpacity
            style={[styles.button, off && styles.buttonDisabled]}
            onPress={onPress}
            disabled={off}
            activeOpacity={0.85}
        >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{title}</Text>}
        </TouchableOpacity>
    );
}

export function LinkButton({ title, onPress }: { title: string; onPress: () => void }) {
    return (
        <TouchableOpacity onPress={onPress} style={{ paddingVertical: 10 }}>
            <Text style={styles.link}>{title}</Text>
        </TouchableOpacity>
    );
}

export function ErrorText({ children }: { children?: string | null }) {
    if (!children) return null;
    return <Text style={styles.error}>{children}</Text>;
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#fff" },
    scroll: { padding: 24, paddingTop: 48, flexGrow: 1, justifyContent: "center" },
    brand: { fontSize: 34, fontWeight: "800", textAlign: "center", color: "#111" },
    title: { fontSize: 20, fontWeight: "700", textAlign: "center", marginTop: 24, color: "#111" },
    subtitle: { fontSize: 14, textAlign: "center", marginTop: 8, color: "#5f6368", lineHeight: 20 },
    label: { fontSize: 13, fontWeight: "600", marginBottom: 6, color: "#3c4043" },
    input: {
        height: 48, borderColor: "#dadce0", borderWidth: 1, borderRadius: 10,
        paddingHorizontal: 14, fontSize: 16, color: "#111", backgroundColor: "#fff",
    },
    button: {
        height: 50, backgroundColor: "#1a73e8", borderRadius: 10,
        alignItems: "center", justifyContent: "center", marginTop: 8,
    },
    buttonDisabled: { backgroundColor: "#a6c8f7" },
    buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    link: { color: "#1a73e8", textAlign: "center", fontSize: 14, fontWeight: "600" },
    error: { color: "#d93025", fontSize: 14, marginBottom: 12, textAlign: "center" },
});
