import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  withSpring,
  useAnimatedProps,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Line, Rect, Text as SvgText } from "react-native-svg";
import { Feather } from "@expo/vector-icons";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Theme ───────────────────────────────────────────────────────────────────

const T = {
  bg: "#09090F",
  surface: "#0C0D16",
  card: "#111420",
  cardAlt: "#0F1119",
  border: "#1B1D2C",
  borderBright: "#252840",
  cyan: "#00D4AA",
  cyanDim: "rgba(0,212,170,0.12)",
  cyanGlow: "rgba(0,212,170,0.3)",
  purple: "#9B5CF6",
  purpleDim: "rgba(155,92,246,0.15)",
  pink: "#F472B6",
  pinkDim: "rgba(244,114,182,0.15)",
  pinkGlow: "rgba(244,114,182,0.4)",
  green: "#34D399",
  greenDim: "rgba(52,211,153,0.15)",
  text: "#E2E8F0",
  textSub: "#8B9CC8",
  textMuted: "#4A5580",
  textDim: "#252840",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface Cell {
  row: number;
  col: number;
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  visited: boolean;
}
interface GameState {
  maze: Cell[][];
  playerRow: number;
  playerCol: number;
  moves: number;
  timeSeconds: number;
  status: "idle" | "playing" | "won";
  cols: number;
  rows: number;
}
type Action =
  | { type: "INIT_MAZE"; maze: Cell[][]; rows: number; cols: number }
  | { type: "MOVE"; dr: number; dc: number }
  | { type: "TICK" }
  | { type: "RESET" };
interface BestScore { time: number; moves: number }

// ─── Maze Generation ─────────────────────────────────────────────────────────

function createGrid(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      row: r, col: c,
      walls: { top: true, right: true, bottom: true, left: true },
      visited: false,
    }))
  );
}
function generateMaze(rows: number, cols: number): Cell[][] {
  const grid = createGrid(rows, cols);
  const dirs = [
    { dr: -1, dc: 0, wall: "top" as const, opposite: "bottom" as const },
    { dr: 0, dc: 1, wall: "right" as const, opposite: "left" as const },
    { dr: 1, dc: 0, wall: "bottom" as const, opposite: "top" as const },
    { dr: 0, dc: -1, wall: "left" as const, opposite: "right" as const },
  ];
  const shuffle = <T,>(a: T[]) => {
    const arr = [...a];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const stack: [number, number][] = [[0, 0]];
  grid[0][0].visited = true;
  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1];
    const nb = shuffle(dirs).filter(({ dr, dc }) => {
      const nr = r + dr; const nc = c + dc;
      return nr >= 0 && nr < rows && nc >= 0 && nc < cols && !grid[nr][nc].visited;
    });
    if (!nb.length) { stack.pop(); continue; }
    const { dr, dc, wall, opposite } = nb[0];
    const nr = r + dr; const nc = c + dc;
    grid[r][c].walls[wall] = false;
    grid[nr][nc].walls[opposite] = false;
    grid[nr][nc].visited = true;
    stack.push([nr, nc]);
  }
  return grid;
}

// ─── BFS ─────────────────────────────────────────────────────────────────────

function findPath(maze: Cell[][], rows: number, cols: number, sr: number, sc: number): Set<string> {
  const q: [number, number, [number, number][]][] = [[sr, sc, [[sr, sc]]]];
  const vis = new Set<string>([`${sr},${sc}`]);
  while (q.length) {
    const [r, c, path] = q.shift()!;
    if (r === rows - 1 && c === cols - 1) return new Set(path.map(([a, b]) => `${a},${b}`));
    for (const { dr, dc, wall } of [
      { dr: -1, dc: 0, wall: "top" as const }, { dr: 1, dc: 0, wall: "bottom" as const },
      { dr: 0, dc: 1, wall: "right" as const }, { dr: 0, dc: -1, wall: "left" as const },
    ]) {
      const nr = r + dr; const nc = c + dc; const key = `${nr},${nc}`;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !maze[r][c].walls[wall] && !vis.has(key)) {
        vis.add(key); q.push([nr, nc, [...path, [nr, nc]]]);
      }
    }
  }
  return new Set();
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "INIT_MAZE": return { ...state, maze: action.maze, rows: action.rows, cols: action.cols, playerRow: 0, playerCol: 0, moves: 0, timeSeconds: 0, status: "playing" };
    case "MOVE": {
      if (state.status !== "playing") return state;
      const { dr, dc } = action;
      const cell = state.maze[state.playerRow][state.playerCol];
      if ((dr === -1 && cell.walls.top) || (dr === 1 && cell.walls.bottom) ||
          (dc === 1 && cell.walls.right) || (dc === -1 && cell.walls.left)) return state;
      const nr = state.playerRow + dr; const nc = state.playerCol + dc;
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) return state;
      return { ...state, playerRow: nr, playerCol: nc, moves: state.moves + 1,
        status: nr === state.rows - 1 && nc === state.cols - 1 ? "won" : "playing" };
    }
    case "TICK": return state.status === "playing" ? { ...state, timeSeconds: state.timeSeconds + 1 } : state;
    case "RESET": return { ...state, maze: [], playerRow: 0, playerCol: 0, moves: 0, timeSeconds: 0, status: "idle" };
    default: return state;
  }
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "@maze_best_scores_v2";
async function loadBests(): Promise<Record<string, BestScore>> {
  try { const r = await AsyncStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
async function saveBest(key: string, time: number, moves: number, cur: Record<string, BestScore>) {
  const prev = cur[key];
  const isNew = !prev || time < prev.time || (time === prev.time && moves < prev.moves);
  if (!isNew) return { updated: cur, isNew: false };
  const updated = { ...cur, [key]: { time, moves } };
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  return { updated, isNew: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LEVELS = [
  { label: "EASY", sub: "10×10", desc: "Training grounds. Low density walls.", rows: 10, cols: 10, accentColor: T.green, icon: "😀" },
  { label: "MEDIUM", sub: "15×15", desc: "Standard logic required. Dynamic paths.", rows: 15, cols: 15, accentColor: T.pink, icon: "🎮" },
  { label: "HARD", sub: "20×20", desc: "Advanced algorithms. Shifting corridors.", rows: 20, cols: 20, accentColor: T.purple, icon: "⚙️" },
  { label: "HARDER", sub: "30×30", desc: "Complex routing. High wall density.", rows: 30, cols: 30, accentColor: T.pink, icon: "🔥" },
  { label: "HARDEST", sub: "40×40", desc: "Near-impossible paths. Extreme logic.", rows: 40, cols: 40, accentColor: "#FF6B6B", icon: "💀" },
  { label: "GOD MODE", sub: "50×50", desc: "No hints. No mercy. 2500 cells to survive.", rows: 50, cols: 50, accentColor: T.cyan, icon: "⚡" },
];
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
function haptic(t: "light" | "medium" | "success" | "error") {
  if (Platform.OS === "web") return;
  try {
    if (t === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (t === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (t === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (t === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {}
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header() {
  return (
    <View style={s.header}>
      <View style={s.headerIcon}>
        <Feather name="grid" size={18} color={T.cyan} />
      </View>
      <Text style={s.headerTitle}>MAZE</Text>
      <View style={{ flex: 1 }} />
      <Pressable style={s.headerGear}>
        <Feather name="settings" size={18} color={T.textMuted} />
      </Pressable>
    </View>
  );
}

// ─── Static Grid (memoized) ───────────────────────────────────────────────────

const StaticGrid = React.memo(function StaticGrid({
  maze, rows, cols, cellSize, offX, offY, size,
}: { maze: Cell[]; rows: number; cols: number; cellSize: number; offX: number; offY: number; size: number }) {
  const cells: React.ReactNode[] = [];
  const walls: React.ReactNode[] = [];
  const flatMaze = maze as unknown as Cell[][];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offX + c * cellSize; const y = offY + r * cellSize;
      const PAD = 1;
      cells.push(<Rect key={`c${r}-${c}`} x={x + PAD} y={y + PAD} width={cellSize - PAD} height={cellSize - PAD} fill={T.card} rx={1} />);
      const w = flatMaze[r][c].walls;
      if (w.top)    walls.push(<Line key={`wt${r}-${c}`} x1={x} y1={y} x2={x + cellSize} y2={y} stroke={T.borderBright} strokeWidth={1.5} />);
      if (w.right)  walls.push(<Line key={`wr${r}-${c}`} x1={x + cellSize} y1={y} x2={x + cellSize} y2={y + cellSize} stroke={T.borderBright} strokeWidth={1.5} />);
      if (w.bottom) walls.push(<Line key={`wb${r}-${c}`} x1={x} y1={y + cellSize} x2={x + cellSize} y2={y + cellSize} stroke={T.borderBright} strokeWidth={1.5} />);
      if (w.left)   walls.push(<Line key={`wl${r}-${c}`} x1={x} y1={y} x2={x} y2={y + cellSize} stroke={T.borderBright} strokeWidth={1.5} />);
    }
  }
  return <>{cells}{walls}</>;
});

// ─── Maze Canvas ─────────────────────────────────────────────────────────────

function MazeCanvas({ maze, rows, cols, playerRow, playerCol, hintPath, size }: {
  maze: Cell[][]; rows: number; cols: number; playerRow: number; playerCol: number; hintPath: Set<string>; size: number;
}) {
  const cs = Math.floor(size / Math.max(rows, cols));
  const offX = Math.floor((size - cs * cols) / 2);
  const offY = Math.floor((size - cs * rows) / 2);
  const pr = Math.max(3, Math.floor(cs * 0.32));

  const tCx = offX + playerCol * cs + cs / 2;
  const tCy = offY + playerRow * cs + cs / 2;
  const cx = useSharedValue(tCx);
  const cy = useSharedValue(tCy);

  useEffect(() => {
    cx.value = withSpring(tCx, { damping: 18, stiffness: 340, mass: 0.55 });
    cy.value = withSpring(tCy, { damping: 18, stiffness: 340, mass: 0.55 });
  }, [tCx, tCy]);

  const aInner = useAnimatedProps(() => ({ cx: cx.value, cy: cy.value }));
  const aOuter = useAnimatedProps(() => ({ cx: cx.value, cy: cy.value }));

  const hintEls = useMemo(() => {
    const els: React.ReactNode[] = [];
    hintPath.forEach((key) => {
      const [r, c] = key.split(",").map(Number);
      if ((r === playerRow && c === playerCol) || (r === 0 && c === 0) || (r === rows - 1 && c === cols - 1)) return;
      const x = offX + c * cs; const y = offY + r * cs;
      els.push(
        <React.Fragment key={key}>
          <Rect x={x + 1} y={y + 1} width={cs - 1} height={cs - 1} fill={T.cyanDim} />
          <Circle cx={x + cs / 2} cy={y + cs / 2} r={Math.max(1.5, cs * 0.12)} fill={T.cyan} opacity={0.6} />
        </React.Fragment>
      );
    });
    return els;
  }, [hintPath, playerRow, playerCol, offX, offY, cs, rows, cols]);

  const goalX = offX + (cols - 1) * cs + cs / 2;
  const goalY = offY + (rows - 1) * cs + cs / 2;

  return (
    <Svg width={size} height={size}>
      <Rect x={0} y={0} width={size} height={size} fill={T.bg} />
      <StaticGrid maze={maze as any} rows={rows} cols={cols} cellSize={cs} offX={offX} offY={offY} size={size} />
      {/* Start cell highlight */}
      <Rect x={offX + 1} y={offY + 1} width={cs - 1} height={cs - 1} fill={T.cyanDim} />
      {/* Goal cell highlight */}
      <Rect x={offX + (cols - 1) * cs + 1} y={offY + (rows - 1) * cs + 1} width={cs - 1} height={cs - 1} fill={T.pinkDim} />
      {hintEls}
      {/* Goal dot (pink glowing) */}
      <Circle cx={goalX} cy={goalY} r={pr * 1.4} fill={T.pinkDim} />
      <Circle cx={goalX} cy={goalY} r={pr * 0.65} fill={T.pink} opacity={0.9} />
      <Circle cx={goalX} cy={goalY} r={pr * 0.28} fill="#fff" opacity={0.7} />
      {/* Player: animated cyan target */}
      <AnimatedCircle animatedProps={aOuter} r={pr * 1.2} fill="none" stroke={T.cyan} strokeWidth={1.5} opacity={0.5} />
      <AnimatedCircle animatedProps={aInner} r={pr * 0.75} fill={T.cyanDim} stroke={T.cyan} strokeWidth={1.5} />
      <AnimatedCircle animatedProps={aInner} r={pr * 0.3} fill={T.cyan} />
    </Svg>
  );
}

// ─── D-Pad ────────────────────────────────────────────────────────────────────

const INITIAL_DELAY = 280;
const REPEAT_MS = 95;

function DPadBtn({ dr, dc, onMove, children }: { dr: number; dc: number; onMove: (dr: number, dc: number) => void; children: React.ReactNode }) {
  const [pressed, setPressed] = useState(false);
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (ivRef.current) { clearInterval(ivRef.current); ivRef.current = null; }
    if (toRef.current) { clearTimeout(toRef.current); toRef.current = null; }
    setPressed(false);
  };
  const start = () => {
    setPressed(true);
    onMove(dr, dc);
    toRef.current = setTimeout(() => { ivRef.current = setInterval(() => onMove(dr, dc), REPEAT_MS); }, INITIAL_DELAY);
  };
  useEffect(() => () => stop(), []);
  return (
    <Pressable style={[dp.btn, pressed && dp.btnActive]} onPressIn={start} onPressOut={stop} delayLongPress={9999}>
      {children}
    </Pressable>
  );
}

function DPad({ onMove }: { onMove: (dr: number, dc: number) => void }) {
  const arrow = (dir: string) => <Feather name={dir as any} size={18} color={T.cyan} />;
  return (
    <View style={dp.wrap}>
      <View style={dp.card}>
        <View style={dp.row}>
          <View style={dp.corner} />
          <DPadBtn dr={-1} dc={0} onMove={onMove}>{arrow("chevron-up")}</DPadBtn>
          <View style={dp.corner} />
        </View>
        <View style={dp.row}>
          <DPadBtn dr={0} dc={-1} onMove={onMove}>{arrow("chevron-left")}</DPadBtn>
          <View style={dp.center}><View style={dp.centerDot} /></View>
          <DPadBtn dr={0} dc={1} onMove={onMove}>{arrow("chevron-right")}</DPadBtn>
        </View>
        <View style={dp.row}>
          <View style={dp.corner} />
          <DPadBtn dr={1} dc={0} onMove={onMove}>{arrow("chevron-down")}</DPadBtn>
          <View style={dp.corner} />
        </View>
      </View>
    </View>
  );
}

// ─── Action Buttons ───────────────────────────────────────────────────────────

function ActionBtn({ label, icon, active, onPress }: { label: string; icon: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable style={[ab.btn, active && ab.btnActive]} onPress={onPress}>
      <Text style={[ab.label, active && ab.labelActive]}>{label}</Text>
      <Feather name={icon as any} size={15} color={active ? T.cyan : T.textMuted} />
    </Pressable>
  );
}

// ─── Idle Screen ─────────────────────────────────────────────────────────────

function IdleScreen({ sizeIndex, setSizeIndex, onStart, bestScores }: {
  sizeIndex: number; setSizeIndex: (i: number) => void; onStart: (i: number) => void; bestScores: Record<string, BestScore>;
}) {
  const pairs = [[0, 1], [2, 3], [4]];
  return (
    <ScrollView contentContainerStyle={idle.scroll} showsVerticalScrollIndicator={false}>
      <View style={idle.badge}><Text style={idle.badgeText}>SYSTEM INITIALIZED</Text></View>
      <Text style={idle.title}>READY TO{"\n"}PLAY?</Text>
      <Text style={idle.subtitle}>SELECT YOUR DIFFICULTY LEVEL</Text>

      {/* Regular level cards */}
      {LEVELS.slice(0, 5).map((lv, i) => {
        const bk = `${lv.rows}x${lv.cols}`;
        const b = bestScores[bk];
        const isSelected = sizeIndex === i;
        return (
          <Pressable key={i} style={[idle.card, isSelected && idle.cardSelected, { borderLeftColor: lv.accentColor }]} onPress={() => setSizeIndex(i)}>
            <View style={{ flex: 1 }}>
              <Text style={[idle.cardLvl, { color: lv.accentColor }]}>LVL {String(i + 1).padStart(2, "0")}</Text>
              <Text style={idle.cardName}>{lv.label}</Text>
              <Text style={idle.cardDesc}>{lv.desc}</Text>
              {b && <Text style={idle.cardBest}>{fmt(b.time)} · {b.moves} moves</Text>}
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Text style={{ fontSize: 20 }}>{lv.icon}</Text>
              <View style={[idle.cardBar, { backgroundColor: lv.accentColor }]} />
            </View>
          </Pressable>
        );
      })}

      {/* GOD MODE card */}
      {(() => {
        const lv = LEVELS[5];
        const b = bestScores[`${lv.rows}x${lv.cols}`];
        const isSelected = sizeIndex === 5;
        return (
          <Pressable style={[idle.godCard, isSelected && idle.godCardSelected]} onPress={() => setSizeIndex(5)}>
            <Text style={idle.godHeader}>ULTIMATE CHALLENGE</Text>
            <Text style={idle.godTitle}>GOD MODE</Text>
            <Text style={idle.godDesc}>{lv.desc}</Text>
            {b && <Text style={idle.cardBest}>{fmt(b.time)} · {b.moves} moves</Text>}
            <Text style={idle.godStars}>★  ★  ★</Text>
          </Pressable>
        );
      })()}

      <Pressable style={idle.startBtn} onPress={() => onStart(sizeIndex)}>
        <Text style={idle.startBtnText}>START GAME  ▶</Text>
      </Pressable>

      <Text style={idle.statusText}>VISUAL ENGINE STATUS: ACTIVE</Text>
    </ScrollView>
  );
}

// ─── Game Screen ─────────────────────────────────────────────────────────────

function GameScreen({ state, dispatch, showHint, setShowHint, onNewMaze, onDifficulty, move, mazeSize, hintPath, panHandlers }: any) {
  return (
    <View style={{ flex: 1 }}>
      {/* Stats */}
      <View style={gs.statsRow}>
        <View style={gs.statCard}>
          <Text style={gs.statLabel}>TIME</Text>
          <Text style={gs.statValue}>{fmt(state.timeSeconds)}</Text>
        </View>
        <View style={gs.statDivider} />
        <View style={gs.statCard}>
          <Text style={gs.statLabel}>MOVES</Text>
          <Text style={gs.statValue}>{String(state.moves)}</Text>
        </View>
      </View>

      {/* Maze */}
      <View style={[gs.mazeWrap, { width: mazeSize, height: mazeSize, alignSelf: "center" }]} {...panHandlers}>
        <MazeCanvas
          maze={state.maze} rows={state.rows} cols={state.cols}
          playerRow={state.playerRow} playerCol={state.playerCol}
          hintPath={hintPath} size={mazeSize}
        />
      </View>

      {/* Controls */}
      <View style={gs.controlsRow}>
        <DPad onMove={move} />
        <View style={gs.actionBtns}>
          <ActionBtn label="HINT" icon="zap" active={showHint} onPress={() => { setShowHint((v: boolean) => !v); haptic("light"); }} />
          <ActionBtn label="NEW MAZE" icon="refresh-cw" onPress={onNewMaze} />
          <ActionBtn label="DIFFICULTY" icon="bar-chart-2" onPress={onDifficulty} />
        </View>
      </View>
    </View>
  );
}

// ─── Win Screen ───────────────────────────────────────────────────────────────

function WinScreen({ state, newRecord, best, onPlayAgain, onChangeLevel }: any) {
  return (
    <ScrollView contentContainerStyle={ws.scroll}>
      <View style={ws.badge}><Text style={ws.badgeText}>{newRecord ? "NEW RECORD" : "LEVEL COMPLETE"}</Text></View>
      <Text style={ws.emoji}>{newRecord ? "🏆" : "🎉"}</Text>
      <Text style={ws.title}>{newRecord ? "RECORD\nBROKEN!" : "MISSION\nCOMPLETE!"}</Text>
      <View style={ws.statsRow}>
        <View style={ws.stat}>
          <Text style={ws.statLabel}>TIME</Text>
          <Text style={ws.statValue}>{fmt(state.timeSeconds)}</Text>
          {best && !newRecord && <Text style={ws.statBest}>best {fmt(best.time)}</Text>}
        </View>
        <View style={ws.statDivider} />
        <View style={ws.stat}>
          <Text style={ws.statLabel}>MOVES</Text>
          <Text style={ws.statValue}>{String(state.moves)}</Text>
          {best && !newRecord && <Text style={ws.statBest}>best {best.moves}</Text>}
        </View>
      </View>
      {newRecord && <Text style={ws.recordNote}>Personal best saved!</Text>}
      <Pressable style={ws.mainBtn} onPress={onPlayAgain}>
        <Text style={ws.mainBtnText}>PLAY AGAIN  ▶</Text>
      </Pressable>
      <Pressable style={ws.secBtn} onPress={onChangeLevel}>
        <Text style={ws.secBtnText}>CHANGE LEVEL</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MazeScreen() {
  const [sizeIndex, setSizeIndex] = useState(1);
  const [showHint, setShowHint] = useState(false);
  const [bests, setBests] = useState<Record<string, BestScore>>({});
  const [newRecord, setNewRecord] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { width } = Dimensions.get("window");
  const mazeSize = Math.min(width - 24, 370);

  const [state, dispatch] = useReducer(reducer, {
    maze: [], playerRow: 0, playerCol: 0, moves: 0, timeSeconds: 0, status: "idle", cols: 15, rows: 15,
  });
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => { loadBests().then(setBests); }, []);

  const startGame = useCallback((idx: number) => {
    const { rows, cols } = LEVELS[idx];
    dispatch({ type: "INIT_MAZE", maze: generateMaze(rows, cols), rows, cols });
    setShowHint(false); setNewRecord(false); haptic("medium");
  }, []);

  const move = useCallback((dr: number, dc: number) => {
    const s = stateRef.current;
    if (s.status !== "playing") return;
    const cell = s.maze[s.playerRow][s.playerCol];
    const blocked = (dr === -1 && cell.walls.top) || (dr === 1 && cell.walls.bottom) ||
      (dc === 1 && cell.walls.right) || (dc === -1 && cell.walls.left);
    if (blocked) haptic("error"); else haptic("light");
    dispatch({ type: "MOVE", dr, dc });
  }, []);

  useEffect(() => {
    if (state.status === "playing") { timerRef.current = setInterval(() => dispatch({ type: "TICK" }), 1000); }
    else if (timerRef.current) { clearInterval(timerRef.current); }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state.status]);

  useEffect(() => {
    if (state.status === "won") {
      haptic("success");
      saveBest(`${state.rows}x${state.cols}`, state.timeSeconds, state.moves, bests)
        .then(({ updated, isNew }) => { setBests(updated); setNewRecord(isNew); });
    }
  }, [state.status]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
    onPanResponderRelease: (_, g) => {
      const THR = 18;
      if (Math.abs(g.dx) < THR && Math.abs(g.dy) < THR) return;
      if (Math.abs(g.dx) > Math.abs(g.dy)) {
        dispatch({ type: "MOVE", dr: 0, dc: g.dx > 0 ? 1 : -1 });
      } else {
        dispatch({ type: "MOVE", dr: g.dy > 0 ? 1 : -1, dc: 0 });
      }
      haptic("light");
    },
  })).current;

  const hintPath = useMemo(() =>
    showHint && state.maze.length > 0
      ? findPath(state.maze, state.rows, state.cols, state.playerRow, state.playerCol)
      : new Set<string>(),
    [showHint, state.maze, state.rows, state.cols, state.playerRow, state.playerCol]
  );

  const currentBest = bests[`${state.rows}x${state.cols}`];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={["top"]}>
      <Header />
      {state.status === "idle" && (
        <IdleScreen sizeIndex={sizeIndex} setSizeIndex={setSizeIndex} onStart={startGame} bestScores={bests} />
      )}
      {state.status === "playing" && (
        <GameScreen
          state={state} dispatch={dispatch} showHint={showHint} setShowHint={setShowHint}
          onNewMaze={() => startGame(sizeIndex)} onDifficulty={() => dispatch({ type: "RESET" })}
          move={move} mazeSize={mazeSize} hintPath={hintPath}
          panHandlers={panResponder.panHandlers}
        />
      )}
      {state.status === "won" && (
        <WinScreen
          state={state} newRecord={newRecord} best={currentBest}
          onPlayAgain={() => startGame(sizeIndex)}
          onChangeLevel={() => dispatch({ type: "RESET" })}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border },
  headerIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: T.cyanDim, borderWidth: 1, borderColor: T.cyan, alignItems: "center", justifyContent: "center", marginRight: 10 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: T.purple, letterSpacing: 3 },
  headerGear: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});

const idle = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 10 },
  badge: { alignSelf: "center", borderWidth: 1, borderColor: T.cyan, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, backgroundColor: T.cyanDim, marginBottom: 4 },
  badgeText: { color: T.cyan, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  title: { fontSize: 38, fontWeight: "900", color: T.text, letterSpacing: 1, textAlign: "center", lineHeight: 44 },
  subtitle: { fontSize: 11, fontWeight: "600", color: T.textMuted, letterSpacing: 2, textAlign: "center", marginBottom: 4 },
  card: { backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, borderLeftWidth: 3, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardSelected: { borderColor: T.borderBright, backgroundColor: T.cardAlt },
  cardLvl: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginBottom: 3 },
  cardName: { fontSize: 18, fontWeight: "800", color: T.text, marginBottom: 3 },
  cardDesc: { fontSize: 11, color: T.textMuted, lineHeight: 16 },
  cardBest: { fontSize: 10, color: T.textDim, marginTop: 4, fontWeight: "600" },
  cardBar: { width: 32, height: 3, borderRadius: 2, marginTop: 4 },
  godCard: { backgroundColor: T.surface, borderRadius: 14, borderWidth: 1, borderColor: T.borderBright, padding: 18, alignItems: "center", gap: 6 },
  godCardSelected: { borderColor: T.cyan, backgroundColor: T.cyanDim },
  godHeader: { fontSize: 10, fontWeight: "700", color: T.cyan, letterSpacing: 2 },
  godTitle: { fontSize: 28, fontWeight: "900", color: T.text, letterSpacing: 2 },
  godDesc: { fontSize: 12, color: T.textMuted, textAlign: "center", lineHeight: 18 },
  godStars: { color: T.cyan, fontSize: 18, letterSpacing: 6, marginTop: 4 },
  startBtn: { backgroundColor: T.purple, borderRadius: 30, paddingVertical: 16, alignItems: "center", marginTop: 6, borderWidth: 1, borderColor: "#A78BFA" },
  startBtnText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 2 },
  statusText: { textAlign: "center", color: T.textDim, fontSize: 9, letterSpacing: 1.5, fontWeight: "600", marginTop: 4 },
});

const gs = StyleSheet.create({
  statsRow: { flexDirection: "row", marginHorizontal: 16, marginVertical: 10, backgroundColor: T.surface, borderRadius: 14, borderWidth: 1, borderColor: T.border, overflow: "hidden" },
  statCard: { flex: 1, paddingVertical: 12, alignItems: "center" },
  statDivider: { width: 1, backgroundColor: T.border, marginVertical: 10 },
  statLabel: { fontSize: 9, fontWeight: "700", color: T.textMuted, letterSpacing: 2, marginBottom: 2 },
  statValue: { fontSize: 24, fontWeight: "800", color: T.cyan, letterSpacing: 1 },
  mazeWrap: { borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: T.borderBright, marginHorizontal: 12 },
  controlsRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, gap: 14, flex: 1 },
  actionBtns: { flex: 1, gap: 8 },
});

const dp = StyleSheet.create({
  wrap: { alignItems: "center" },
  card: { backgroundColor: T.surface, borderRadius: 16, borderWidth: 1, borderColor: T.border, padding: 6, gap: 4 },
  row: { flexDirection: "row", gap: 4, alignItems: "center" },
  btn: { width: 56, height: 56, borderRadius: 12, backgroundColor: T.card, borderWidth: 1, borderColor: T.borderBright, alignItems: "center", justifyContent: "center" },
  btnActive: { backgroundColor: T.cyanDim, borderColor: T.cyan },
  corner: { width: 56, height: 56 },
  center: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  centerDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: T.green, borderWidth: 2, borderColor: "#6EE7B7" },
});

const ab = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: T.border, backgroundColor: T.card },
  btnActive: { borderColor: T.cyan, backgroundColor: T.cyanDim },
  label: { fontSize: 11, fontWeight: "700", color: T.textMuted, letterSpacing: 1 },
  labelActive: { color: T.cyan },
});

const ws = StyleSheet.create({
  scroll: { flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40, alignItems: "center", gap: 14 },
  badge: { borderWidth: 1, borderColor: T.cyan, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, backgroundColor: T.cyanDim },
  badgeText: { color: T.cyan, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  emoji: { fontSize: 56, marginTop: 8 },
  title: { fontSize: 36, fontWeight: "900", color: T.text, letterSpacing: 1, textAlign: "center", lineHeight: 42 },
  statsRow: { flexDirection: "row", backgroundColor: T.surface, borderRadius: 14, borderWidth: 1, borderColor: T.border, overflow: "hidden", width: "100%" },
  stat: { flex: 1, paddingVertical: 16, alignItems: "center" },
  statDivider: { width: 1, backgroundColor: T.border, marginVertical: 10 },
  statLabel: { fontSize: 9, fontWeight: "700", color: T.textMuted, letterSpacing: 2, marginBottom: 4 },
  statValue: { fontSize: 28, fontWeight: "800", color: T.cyan, letterSpacing: 1 },
  statBest: { fontSize: 10, color: T.textDim, marginTop: 3 },
  recordNote: { color: T.cyan, fontSize: 12, fontWeight: "600", opacity: 0.7 },
  mainBtn: { backgroundColor: T.purple, borderRadius: 30, paddingVertical: 16, alignItems: "center", width: "100%", borderWidth: 1, borderColor: "#A78BFA" },
  mainBtnText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 2 },
  secBtn: { backgroundColor: T.card, borderRadius: 14, paddingVertical: 12, alignItems: "center", width: "100%", borderWidth: 1, borderColor: T.border },
  secBtnText: { color: T.textMuted, fontSize: 13, fontWeight: "700", letterSpacing: 1 },
});
