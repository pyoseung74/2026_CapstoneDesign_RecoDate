import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Phase1DemoApp } from "./src/modules/phase1-initial-input/Phase1DemoApp";

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Phase1DemoApp />
    </SafeAreaProvider>
  );
}
