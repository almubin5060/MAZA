import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

const T = {
  bg: "#09090F", surface: "#0C0D16", card: "#111420", border: "#1B1D2C",
  cyan: "#00D4AA", cyanDim: "rgba(0,212,170,0.12)", purple: "#9B5CF6",
  text: "#E2E8F0", textMuted: "#4A5580",
};

export default function RankScreen() {
  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <View style={s.header}>
        <View style={s.iconWrap}><Feather name="bar-chart-2" size={18} color={T.cyan} /></View>
        <Text style={s.headerTitle}>RANK</Text>
      </View>
      <View style={s.body}>
        <View style={s.iconBig}><Feather name="bar-chart-2" size={36} color={T.cyan} /></View>
        <View style={s.badge}><Text style={s.badgeText}>COMING SOON</Text></View>
        <Text style={s.title}>GLOBAL RANKINGS</Text>
        <Text style={s.desc}>Compete against players worldwide.{"\n"}Online leaderboards launching soon.</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border, gap: 10 },
  iconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: T.cyanDim, borderWidth: 1, borderColor: T.cyan, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: T.purple, letterSpacing: 3 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  iconBig: { width: 72, height: 72, borderRadius: 20, backgroundColor: T.cyanDim, borderWidth: 1, borderColor: T.cyan, alignItems: "center", justifyContent: "center" },
  badge: { borderWidth: 1, borderColor: T.cyan, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, backgroundColor: T.cyanDim },
  badgeText: { color: T.cyan, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  title: { fontSize: 20, fontWeight: "800", color: T.text, letterSpacing: 1, textAlign: "center" },
  desc: { fontSize: 13, color: T.textMuted, lineHeight: 20, textAlign: "center" },
});
