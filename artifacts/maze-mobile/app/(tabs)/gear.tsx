import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

const T = {
  bg: "#09090F", surface: "#0C0D16", card: "#111420", border: "#1B1D2C", borderBright: "#252840",
  cyan: "#00D4AA", cyanDim: "rgba(0,212,170,0.12)", purple: "#9B5CF6",
  pink: "#F472B6", pinkDim: "rgba(244,114,182,0.15)",
  text: "#E2E8F0", textSub: "#8B9CC8", textMuted: "#4A5580",
};

export default function GearScreen() {
  const [cleared, setCleared] = useState(false);

  const clearScores = () => {
    Alert.alert("Clear All Scores", "This will permanently delete all your personal best scores.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear", style: "destructive",
        onPress: async () => {
          await AsyncStorage.removeItem("@maze_best_scores_v2");
          setCleared(true);
          setTimeout(() => setCleared(false), 3000);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <View style={s.header}>
        <View style={s.iconWrap}><Feather name="sliders" size={18} color={T.cyan} /></View>
        <Text style={s.headerTitle}>GEAR</Text>
      </View>
      <View style={s.body}>
        <View style={s.section}>
          <Text style={s.sectionTitle}>SYSTEM</Text>
          <View style={s.row}>
            <View style={s.rowIcon}><Feather name="info" size={16} color={T.cyan} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Version</Text>
              <Text style={s.rowSub}>Maze Game v1.0.0</Text>
            </View>
          </View>
          <View style={s.row}>
            <View style={s.rowIcon}><Feather name="user" size={16} color={T.cyan} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Made by</Text>
              <Text style={s.rowSub}>Mubin</Text>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>DATA</Text>
          <Pressable style={[s.dangerRow, cleared && s.dangerRowDone]} onPress={clearScores}>
            <View style={[s.rowIcon, { backgroundColor: cleared ? T.cyanDim : T.pinkDim, borderColor: cleared ? T.cyan : T.pink }]}>
              <Feather name={cleared ? "check" : "trash-2"} size={16} color={cleared ? T.cyan : T.pink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, { color: cleared ? T.cyan : T.pink }]}>
                {cleared ? "Scores Cleared!" : "Clear All Scores"}
              </Text>
              <Text style={s.rowSub}>Delete all personal best records</Text>
            </View>
            {!cleared && <Feather name="chevron-right" size={16} color={T.textMuted} />}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border, gap: 10 },
  iconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: T.cyanDim, borderWidth: 1, borderColor: T.cyan, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: T.purple, letterSpacing: 3 },
  body: { flex: 1, padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 9, fontWeight: "700", color: T.textMuted, letterSpacing: 2, marginBottom: 4, paddingLeft: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 14 },
  rowIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: T.cyanDim, borderWidth: 1, borderColor: T.cyan, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 14, fontWeight: "700", color: T.text },
  rowSub: { fontSize: 11, color: T.textMuted, marginTop: 2 },
  dangerRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: "rgba(244,114,182,0.3)", padding: 14 },
  dangerRowDone: { borderColor: "rgba(0,212,170,0.3)" },
});
