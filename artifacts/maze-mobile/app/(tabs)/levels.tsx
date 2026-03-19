import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

const T = {
  bg: "#09090F", surface: "#0C0D16", card: "#111420",
  border: "#1B1D2C", borderBright: "#252840",
  cyan: "#00D4AA", cyanDim: "rgba(0,212,170,0.12)",
  purple: "#9B5CF6", pink: "#F472B6", green: "#34D399",
  text: "#E2E8F0", textSub: "#8B9CC8", textMuted: "#4A5580",
};

const LEVELS = [
  { label: "EASY", sub: "10×10", rows: 10, cols: 10, color: T.green },
  { label: "MEDIUM", sub: "15×15", rows: 15, cols: 15, color: T.pink },
  { label: "HARD", sub: "20×20", rows: 20, cols: 20, color: T.purple },
  { label: "HARDER", sub: "30×30", rows: 30, cols: 30, color: T.pink },
  { label: "HARDEST", sub: "40×40", rows: 40, cols: 40, color: "#FF6B6B" },
  { label: "GOD MODE", sub: "50×50", rows: 50, cols: 50, color: T.cyan },
];

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function LevelsScreen() {
  const [bests, setBests] = useState<Record<string, { time: number; moves: number }>>({});

  useEffect(() => {
    AsyncStorage.getItem("@maze_best_scores_v2").then((r) => {
      if (r) setBests(JSON.parse(r));
    });
  }, []);

  const completed = LEVELS.filter((l) => bests[`${l.rows}x${l.cols}`]).length;

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <View style={s.header}>
        <View style={s.iconWrap}><Feather name="layers" size={18} color={T.cyan} /></View>
        <Text style={s.headerTitle}>LEVELS</Text>
      </View>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.badge}>
          <Text style={s.badgeText}>{completed} / {LEVELS.length} COMPLETED</Text>
        </View>
        {LEVELS.map((lv, i) => {
          const b = bests[`${lv.rows}x${lv.cols}`];
          return (
            <View key={i} style={[s.card, b && s.cardDone, { borderLeftColor: lv.color }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.lvlLabel, { color: lv.color }]}>LVL {String(i + 1).padStart(2, "0")}</Text>
                <Text style={s.lvlName}>{lv.label}</Text>
                <Text style={s.lvlSub}>{lv.sub}</Text>
              </View>
              {b ? (
                <View style={s.scoreWrap}>
                  <View style={s.scoreItem}>
                    <Text style={s.scoreLabel}>TIME</Text>
                    <Text style={[s.scoreValue, { color: T.cyan }]}>{fmt(b.time)}</Text>
                  </View>
                  <View style={s.scoreItem}>
                    <Text style={s.scoreLabel}>MOVES</Text>
                    <Text style={[s.scoreValue, { color: T.pink }]}>{b.moves}</Text>
                  </View>
                </View>
              ) : (
                <View style={s.lockedWrap}>
                  <Feather name="lock" size={16} color={T.textMuted} />
                  <Text style={s.lockedText}>NOT PLAYED</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border, gap: 10 },
  iconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: T.cyanDim, borderWidth: 1, borderColor: T.cyan, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: T.purple, letterSpacing: 3 },
  scroll: { padding: 16, gap: 10, paddingBottom: 32 },
  badge: { alignSelf: "center", borderWidth: 1, borderColor: T.cyan, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: T.cyanDim, marginBottom: 8 },
  badgeText: { color: T.cyan, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  card: { backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, borderLeftWidth: 3, padding: 14, flexDirection: "row", alignItems: "center" },
  cardDone: { borderColor: T.borderBright },
  lvlLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginBottom: 2 },
  lvlName: { fontSize: 16, fontWeight: "800", color: T.text },
  lvlSub: { fontSize: 11, color: T.textMuted, marginTop: 2 },
  scoreWrap: { flexDirection: "row", gap: 14 },
  scoreItem: { alignItems: "center" },
  scoreLabel: { fontSize: 8, fontWeight: "700", color: T.textMuted, letterSpacing: 1.5 },
  scoreValue: { fontSize: 14, fontWeight: "800", marginTop: 2 },
  lockedWrap: { alignItems: "center", gap: 4 },
  lockedText: { fontSize: 8, color: T.textMuted, letterSpacing: 1 },
});
