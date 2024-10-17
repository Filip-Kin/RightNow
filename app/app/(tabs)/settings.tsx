import React, { useState } from "react";
import {  Text, TextInput, StyleSheet, Button, View } from "react-native";
import { resetConfig, useConfig } from "@/lib/config";
import { SafeAreaView } from "react-native-safe-area-context";
import DatePicker from 'react-native-date-picker';
import { useDate } from "@/lib/time";
import { scheduleHourlyNotificationRightNow } from "@/lib/notification";

export default function Settings() {
  const config = useConfig();


  const maxDate = useDate('hourly');
  maxDate.setMinutes(0);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.label}>Endpoint:</Text>
      <TextInput
        style={styles.input}
        value={config.endpoint}
        onChangeText={(value) => {
          config.endpoint = value;
        }}
        placeholder="Enter endpoint"
      />

      <Text style={styles.label}>Set Latest Sync</Text>
<View style={{ alignItems: 'center' }}>
      <DatePicker
        date={new Date(config.lastSync)}
        onDateChange={(newDate) => {
          newDate.setMinutes(0);
          newDate.setSeconds(0);
          newDate.setMilliseconds(0);
          config.lastSync = newDate.getTime();
        }}
        theme="light"
        maximumDate={maxDate}
        />
        </View>

      <Text style={styles.label}>Time Format</Text>
      <Button
        title={config.hour24 ? "24 Hour" : "12 Hour"}
        onPress={() => {
          config.hour24 = !config.hour24;
        }}
      />
            <Button
        title={"Reset Everything"}
        onPress={() => {
          resetConfig();
        }}
      />

<Button
        title={"Send Test Notification"}
        onPress={() => {
          scheduleHourlyNotificationRightNow();
        }}
      />
      
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
  label: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  input: {
    height: 40,
    borderColor: "#ccc",
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
});
