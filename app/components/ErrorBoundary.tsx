// Catches JS render/lifecycle errors anywhere below it and shows a recoverable
// fallback instead of a white screen. Note: this cannot catch native crashes (an
// uncaught exception in a native module kills the process before JS sees it) - it
// only guards the JS/React layer. Self-contained styling so a broken theme provider
// can't take the fallback down with it.
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface Props { children: React.ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the real cause diagnosable on-device rather than swallowing it.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: "#111111", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: "#ffffff", fontSize: 20, fontWeight: "700", marginBottom: 8 }}>Something went wrong</Text>
        <Text style={{ color: "#aaaaaa", fontSize: 14, textAlign: "center", marginBottom: 24 }}>
          {this.state.error.message || "Unexpected error"}
        </Text>
        <TouchableOpacity
          onPress={this.reset}
          style={{ backgroundColor: "#7C3AED", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 }}
        >
          <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "700" }}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
