// Persistent storage for sensitive material (session token + cached DEK).
// Native uses the OS keychain/keystore via expo-secure-store; web has no
// equivalent, so it falls back to AsyncStorage (less secure, web is secondary).
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const useSecure = Platform.OS !== "web";

export async function secureGet(key: string): Promise<string | null> {
    return useSecure ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key);
}

export async function secureSet(key: string, value: string): Promise<void> {
    if (useSecure) await SecureStore.setItemAsync(key, value);
    else await AsyncStorage.setItem(key, value);
}

export async function secureDelete(key: string): Promise<void> {
    if (useSecure) await SecureStore.deleteItemAsync(key);
    else await AsyncStorage.removeItem(key);
}
