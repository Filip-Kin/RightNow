import React from "react";
import { Text, StyleSheet, Button, View, TouchableOpacity } from "react-native";
import { resetConfig, useConfig } from "@/lib/config";
import { SafeAreaView } from "react-native-safe-area-context";
import { scheduleDailyReminder, scheduleTestNotification } from "@/lib/notification";
import { logout, useAuth } from "@/lib/auth";

function formatHour(hour: number, hour24: boolean): string {
  if (hour24) return `${hour.toString().padStart(2, "0")}:00`;
  const h = hour % 12 || 12;
  return `${h}:00 ${hour < 12 ? "AM" : "PM"}`;
}

export default function Settings() {
  const config = useConfig();
  const { email } = useAuth();

  function setReminderHour(next: number) {
    const hour = (next + 24) % 24;
    config.reminderHour = hour;
    scheduleDailyReminder(hour);
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Settings</Text>

      <Text style={styles.label}>Time Format</Text>
      <Button
        title={config.hour24 ? "24 Hour" : "12 Hour"}
        onPress={() => {
          config.hour24 = !config.hour24;
        }}
      />

      <Text style={styles.label}>Daily Reminder</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.stepper} onPress={() => setReminderHour(config.reminderHour - 1)}>
          <Text style={styles.stepperText}>-</Text>
        </TouchableOpacity>
        <Text style={styles.reminderValue}>{formatHour(config.reminderHour, config.hour24)}</Text>
        <TouchableOpacity style={styles.stepper} onPress={() => setReminderHour(config.reminderHour + 1)}>
          <Text style={styles.stepperText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.spacer} />
      <Button title={"Send Test Notification"} onPress={() => { scheduleTestNotification(); }} />
      <Button title={"Reset Settings"} onPress={() => { resetConfig(); }} />

      <View style={styles.account}>
        {email ? <Text style={styles.accountText}>Signed in as {email}</Text> : null}
        <Button title={"Log Out"} color="#d93025" onPress={() => { logout(); }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  heading: { fontSize: 28, fontWeight: "800", marginBottom: 16, color: "#111" },
  label: { fontSize: 16, fontWeight: "bold", marginTop: 20, marginBottom: 8, color: "#3c4043" },
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepper: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1a73e8", alignItems: "center", justifyContent: "center" },
  stepperText: { color: "#fff", fontSize: 24, fontWeight: "700", lineHeight: 26 },
  reminderValue: { fontSize: 18, fontWeight: "600", color: "#111", minWidth: 90, textAlign: "center" },
  spacer: { height: 28 },
  account: { marginTop: "auto", paddingTop: 24 },
  accountText: { fontSize: 14, color: "#5f6368", marginBottom: 8 },
});
