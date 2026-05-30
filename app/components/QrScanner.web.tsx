// Web QR scanner: getUserMedia into a <video>, decode frames with jsQR. Used
// instead of expo-camera on web because BarcodeDetector isn't supported in every
// browser (e.g. Firefox). The <video>/<canvas> are real DOM nodes appended to the
// ref'd container (react-native-web forwards the ref to the underlying div).
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import jsQR from "jsqr";
import { useTheme } from "@/lib/theme";

export function QrScanner({ onScan }: { onScan: (value: string) => void }) {
  const c = useTheme();
  const containerRef = useRef<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    const host = containerRef.current as unknown as HTMLElement | null;
    if (!host || typeof document === "undefined") return;

    const video = document.createElement("video");
    video.setAttribute("playsinline", "true");
    video.muted = true;
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";
    host.appendChild(video);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    let stream: MediaStream | null = null;
    let raf = 0;
    let fired = false;

    function tick() {
      if (fired) return;
      if (ctx && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          fired = true;
          onScanRef.current(code.data);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        video.srcObject = s;
        return video.play();
      })
      .then(() => { raf = requestAnimationFrame(tick); })
      .catch((e) => setError(e instanceof Error ? e.message : "Camera unavailable"));

    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      video.remove();
    };
  }, []);

  return (
    <View style={styles.fill}>
      <View ref={containerRef} style={styles.fill} />
      {error && (
        <View style={styles.error}>
          <Text style={{ color: c.danger, textAlign: "center" }}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  error: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 24 },
});
