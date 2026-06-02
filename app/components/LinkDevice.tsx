// QR cross-device sign-in UI. One device shows the QR, the other scans it; whoever
// is signed in hands over a fresh session + the DEK (see lib/auth startShowLink /
// startScanLink). Defaults to "show" on web and "scan" on native, matching the
// natural "phone scans, web displays" flow, but either is available on both.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { QrScanner } from "@/components/QrScanner";
import { startScanLink, startShowLink, type ShowLink } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

type Mode = "show" | "scan";
type Done = "linked" | "delivered";

export function LinkDevice() {
  const c = useTheme();
  const [mode, setMode] = useState<Mode>(Platform.OS === "web" ? "show" : "scan");
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const scanLockRef = useRef(false);
  const scanPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [focused, setFocused] = useState(true);
  const checkScale = useRef(new Animated.Value(0)).current;

  // This screen lives in the tab navigator and stays mounted, so a completed link
  // (the green check) would otherwise still be showing when you come back. Reset to a
  // fresh QR on every focus, and stop polling on blur.
  useFocusEffect(useCallback(() => {
    setFocused(true);
    setDone(null);
    setStatus("");
    setQr(null);
    scanLockRef.current = false;
    return () => {
      setFocused(false);
      if (scanPollRef.current) { clearInterval(scanPollRef.current); scanPollRef.current = null; }
    };
  }, []));

  // Spring the green checkmark in when the link completes (the QR is gone by then,
  // so it reads as the code turning into a check in the same spot).
  useEffect(() => {
    if (!done) return;
    checkScale.setValue(0);
    Animated.spring(checkScale, { toValue: 1, friction: 4, tension: 90, useNativeDriver: Platform.OS !== "web" }).start();
  }, [done]);

  // Show mode: open a channel and poll until the other device acts. Gated on focus so
  // it restarts with a fresh QR when you return and stops when you leave.
  useEffect(() => {
    if (!focused || mode !== "show" || done) return;
    let alive = true;
    const sl: ShowLink = startShowLink();
    setQr(sl.qrValue);
    setStatus(sl.giver
      ? "Scan this with the device you want to sign in."
      : "Scan this with a device that's already signed in.");
    const id = setInterval(async () => {
      try {
        const r = await sl.poll();
        if (!alive) return;
        if (r === "linked" || r === "delivered") { setDone(r); clearInterval(id); }
      } catch { /* transient; keep polling */ }
    }, 1500);
    return () => { alive = false; clearInterval(id); };
  }, [focused, mode, done]);

  async function handleScan(value: string) {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    setStatus("Linking…");
    try {
      const sl = await startScanLink(value);
      if (sl.status !== "pending") { setDone(sl.status); return; }
      // Receiver: our key is posted; poll for the giver's sealed bundle. Track the
      // interval so leaving the screen (blur) stops it.
      const id = setInterval(async () => {
        try {
          const r = await sl.poll!();
          if (r === "linked") { setDone("linked"); clearInterval(id); scanPollRef.current = null; }
        } catch { /* keep polling */ }
      }, 1500);
      scanPollRef.current = id;
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Link failed.");
      scanLockRef.current = false; // allow another scan
    }
  }

  if (done) {
    return (
      <View style={styles.doneWrap}>
        <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
          <Text style={styles.checkMark}>✓</Text>
        </Animated.View>
        <Text style={[styles.doneTitle, { color: c.text }]}>
          {done === "delivered" ? "Device linked" : "Signed in!"}
        </Text>
        <Text style={[styles.doneBody, { color: c.textMuted }]}>
          {done === "delivered"
            ? "The other device is now signed in to this account."
            : "You're all set. Taking you in…"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.segment, { borderColor: c.border }]}>
        {(["show", "scan"] as Mode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.segItem, { backgroundColor: mode === m ? c.primary : c.card }]}
            onPress={() => { scanLockRef.current = false; setStatus(""); setMode(m); }}
          >
            <Text style={{ color: mode === m ? c.onPrimary : c.textBody, fontWeight: "600" }}>
              {m === "show" ? "Show code" : "Scan code"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === "show"
        ? (
          <View style={styles.showWrap}>
            {qr && (
              <View style={styles.qrBox}>
                <QRCode value={qr} size={232} />
              </View>
            )}
          </View>
        )
        : (
          <View style={[styles.scanBox, { borderColor: c.border }]}>
            <QrScanner onScan={handleScan} />
          </View>
        )}

      <Text style={[styles.status, { color: c.textMuted }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 16 },
  segment: { flexDirection: "row", borderWidth: 1, borderRadius: 8, overflow: "hidden", alignSelf: "center" },
  segItem: { paddingVertical: 8, paddingHorizontal: 22 },
  showWrap: { alignItems: "center", marginTop: 8 },
  // QR stays dark-on-white for reliable scanning regardless of theme.
  qrBox: { backgroundColor: "#fff", padding: 16, borderRadius: 12 },
  scanBox: { height: 300, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  status: { textAlign: "center", fontSize: 14, lineHeight: 20 },
  doneWrap: { padding: 32, alignItems: "center", gap: 12 },
  checkCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#34a853", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  checkMark: { color: "#fff", fontSize: 56, fontWeight: "900", lineHeight: 60 },
  doneTitle: { fontSize: 22, fontWeight: "800" },
  doneBody: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
