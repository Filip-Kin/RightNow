// Native QR scanner (expo-camera). The web variant (QrScanner.web.tsx) uses
// getUserMedia + jsQR instead, since BarcodeDetector isn't available everywhere.
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useTheme } from "@/lib/theme";

export function QrScanner({ onScan }: { onScan: (value: string) => void }) {
  const c = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [done, setDone] = useState(false);

  if (!permission) return <View style={styles.fill} />;
  if (!permission.granted) {
    return (
      <View style={[styles.fill, styles.center]}>
        <Text style={{ color: c.text, marginBottom: 12, textAlign: "center" }}>
          Camera access is needed to scan the code.
        </Text>
        <TouchableOpacity style={[styles.btn, { backgroundColor: c.primary }]} onPress={requestPermission}>
          <Text style={{ color: c.onPrimary, fontWeight: "700" }}>Grant camera access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <CameraView
      style={styles.fill}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      onBarcodeScanned={({ data }) => {
        if (done) return; // fire once
        setDone(true);
        onScan(data);
      }}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  btn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
});
