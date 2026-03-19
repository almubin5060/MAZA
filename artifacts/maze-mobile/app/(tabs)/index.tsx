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

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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

interface BestScore {
  time: number;
  moves: number;
}

// ─── Maze Generation ─────────────────────────────────────────────────────────

function createGrid(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      row: r,
      col: c,
      walls: { top: true, right: true, bottom: true, left: true },
      visited: false,
    }))
  );
}

function generateMaze(rows: number, cols: number): Cell[][] {
  const grid = createGrid(rows, cols);
  const directions = [
    { dr: -1, dc: 0, wall: "top" as const, opposite: "bottom" as const },
    { dr: 0, dc: 1, wall: "right" as const, opposite: "left" as const },
    { dr: 1, dc: 0, wall: "bottom" as const, opposite: "top" as const },
    { dr: 0, dc: -1, wall: "left" as const, opposite: "right" as const },
  ];
  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const stack: [number, number][] = [];
  grid[0][0].visited = true;
  stack.push([0, 0]);
  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1];
    const neighbors = shuffle(directions).filter(({ dr, dc }) => {
      const nr = r + dr;
      const nc = c + dc;
      return nr >= 0 && nr < rows && nc >= 0 && nc < cols && !grid[nr][nc].visited;
    });
    if (neighbors.length === 0) {
      stack.pop();
    } else {
      const { dr, dc, wall, opposite } = neighbors[0];
      const nr = r + dr;
      const nc = c + dc;
      grid[r][c].walls[wall] = false;
      grid[nr][nc].walls[opposite] = false;
      grid[nr][nc].visited = true;
      stack.push([nr, nc]);
    }
  }
  return grid;
}

// ─── BFS Pathfinder ──────────────────────────────────────────────────────────

function findPath(
  maze: Cell[][],
  rows: number,
  cols: number,
  startRow: number,
  startCol: number
): Set<string> {
  const endRow = rows - 1;
  const endCol = cols - 1;
  const queue: [number, number, [number, number][]][] = [
    [startRow, startCol, [[startRow, startCol]]],
  ];
  const visited = new Set<string>();
  visited.add(`${startRow},${startCol}`);
  while (queue.length > 0) {
    const [r, c, path] = queue.shift()!;
    if (r === endRow && c === endCol)
      return new Set(path.map(([pr, pc]) => `${pr},${pc}`));
    const cell = maze[r][c];
    for (const { dr, dc, wall } of [
      { dr: -1, dc: 0, wall: "top" as const },
      { dr: 1, dc: 0, wall: "bottom" as const },
      { dr: 0, dc: 1, wall: "right" as const },
      { dr: 0, dc: -1, wall: "left" as const },
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      const key = `${nr},${nc}`;
      if (
        nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
        !cell.walls[wall] && !visited.has(key)
      ) {
        visited.add(key);
        queue.push([nr, nc, [...path, [nr, nc]]]);
      }
    }
  }
  return new Set();
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "INIT_MAZE":
      return {
        ...state,
        maze: action.maze,
        rows: action.rows,
        cols: action.cols,
        playerRow: 0,
        playerCol: 0,
        moves: 0,
        timeSeconds: 0,
        status: "playing",
      };
    case "MOVE": {
      if (state.status !== "playing") return state;
      const { dr, dc } = action;
      const { playerRow: r, playerCol: c, maze } = state;
      const cell = maze[r][c];
      if (
        (dr === -1 && cell.walls.top) ||
        (dr === 1 && cell.walls.bottom) ||
        (dc === 1 && cell.walls.right) ||
        (dc === -1 && cell.walls.left)
      )
        return state;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) return state;
      return {
        ...state,
        playerRow: nr,
        playerCol: nc,
        moves: state.moves + 1,
        status: nr === state.rows - 1 && nc === state.cols - 1 ? "won" : "playing",
      };
    }
    case "TICK":
      if (state.status !== "playing") return state;
      return { ...state, timeSeconds: state.timeSeconds + 1 };
    case "RESET":
      return { ...state, maze: [], playerRow: 0, playerCol: 0, moves: 0, timeSeconds: 0, status: "idle" };
    default:
      return state;
  }
}

// ─── Best Score Helpers ───────────────────────────────────────────────────────

const STORAGE_KEY = "@maze_best_scores";

async function loadBestScores(): Promise<Record<string, BestScore>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveBestScore(
  key: string,
  time: number,
  moves: number,
  current: Record<string, BestScore>
): Promise<{ updated: Record<string, BestScore>; isNew: boolean }> {
  const prev = current[key];
  const isNew = !prev || time < prev.time || (time === prev.time && moves < prev.moves);
  if (!isNew) return { updated: current, isNew: false };
  const updated = { ...current, [key]: { time, moves } };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
  return { updated, isNew: true };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAZE_SIZES = [
  { label: "Easy", sub: "10×10", rows: 10, cols: 10 },
  { label: "Medium", sub: "15×15", rows: 15, cols: 15 },
  { label: "Hard", sub: "20×20", rows: 20, cols: 20 },
  { label: "Harder", sub: "30×30", rows: 30, cols: 30 },
  { label: "Hardest", sub: "40×40", rows: 40, cols: 40 },
  { label: "GOD", sub: "50×50", rows: 50, cols: 50 },
];

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

function haptic(type: "light" | "medium" | "success" | "error") {
  if (Platform.OS === "web") return;
  try {
    if (type === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (type === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (type === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {}
}

// ─── Static Maze Grid (memoized) ─────────────────────────────────────────────

interface StaticGridProps {
  maze: Cell[][];
  rows: number;
  cols: number;
  cellSize: number;
  offX: number;
  offY: number;
  size: number;
}

const StaticGrid = React.memo(function StaticGrid({
  maze, rows, cols, cellSize, offX, offY, size,
}: StaticGridProps) {
  const cellRects: React.ReactNode[] = [];
  const wallLines: React.ReactNode[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offX + c * cellSize;
      const y = offY + r * cellSize;
      const isStart = r === 0 && c === 0;
      const isGoal = r === rows - 1 && c === cols - 1;

      cellRects.push(
        <Rect
          key={`c-${r}-${c}`}
          x={x + 1} y={y + 1}
          width={cellSize - 1} height={cellSize - 1}
          fill={isStart ? "rgba(34,211,153,0.22)" : isGoal ? "rgba(251,191,36,0.22)" : "#1e2030"}
        />
      );

      const { walls } = maze[r][c];
      if (walls.top) wallLines.push(<Line key={`wt-${r}-${c}`} x1={x} y1={y} x2={x + cellSize} y2={y} stroke="#4a5070" strokeWidth={1.5} />);
      if (walls.right) wallLines.push(<Line key={`wr-${r}-${c}`} x1={x + cellSize} y1={y} x2={x + cellSize} y2={y + cellSize} stroke="#4a5070" strokeWidth={1.5} />);
      if (walls.bottom) wallLines.push(<Line key={`wb-${r}-${c}`} x1={x} y1={y + cellSize} x2={x + cellSize} y2={y + cellSize} stroke="#4a5070" strokeWidth={1.5} />);
      if (walls.left) wallLines.push(<Line key={`wl-${r}-${c}`} x1={x} y1={y} x2={x} y2={y + cellSize} stroke="#4a5070" strokeWidth={1.5} />);
    }
  }

  const fontSize = Math.max(6, cellSize - 6);

  return (
    <>
      <Rect x={0} y={0} width={size} height={size} fill="#0f1117" />
      {cellRects}
      {wallLines}
      <SvgText
        x={offX + cellSize / 2} y={offY + cellSize / 2 + fontSize * 0.36}
        fontSize={fontSize} fontWeight="bold" fill="#34d399" textAnchor="middle"
      >S</SvgText>
      <SvgText
        x={offX + (cols - 1) * cellSize + cellSize / 2}
        y={offY + (rows - 1) * cellSize + cellSize / 2 + fontSize * 0.36}
        fontSize={fontSize} fontWeight="bold" fill="#fbbf24" textAnchor="middle"
      >G</SvgText>
    </>
  );
});

// ─── Maze Canvas ─────────────────────────────────────────────────────────────

interface MazeCanvasProps {
  maze: Cell[][];
  rows: number;
  cols: number;
  playerRow: number;
  playerCol: number;
  hintPath: Set<string>;
  size: number;
}

function MazeCanvas({ maze, rows, cols, playerRow, playerCol, hintPath, size }: MazeCanvasProps) {
  const cellSize = Math.floor(size / Math.max(rows, cols));
  const totalW = cellSize * cols;
  const totalH = cellSize * rows;
  const offX = Math.floor((size - totalW) / 2);
  const offY = Math.floor((size - totalH) / 2);

  const radius = Math.max(3, Math.floor(cellSize * 0.3));

  const targetCx = offX + playerCol * cellSize + cellSize / 2;
  const targetCy = offY + playerRow * cellSize + cellSize / 2;

  const cx = useSharedValue(targetCx);
  const cy = useSharedValue(targetCy);

  useEffect(() => {
    cx.value = withSpring(targetCx, { damping: 18, stiffness: 320, mass: 0.6 });
    cy.value = withSpring(targetCy, { damping: 18, stiffness: 320, mass: 0.6 });
  }, [targetCx, targetCy]);

  const animatedPlayerProps = useAnimatedProps(() => ({
    cx: cx.value,
    cy: cy.value,
  }));

  const animatedGlowProps = useAnimatedProps(() => ({
    cx: cx.value - radius * 0.2,
    cy: cy.value - radius * 0.25,
  }));

  const hintDots = useMemo(() => {
    const dots: React.ReactNode[] = [];
    hintPath.forEach((key) => {
      const [r, c] = key.split(",").map(Number);
      const isPlayer = r === playerRow && c === playerCol;
      const isStart = r === 0 && c === 0;
      const isGoal = r === rows - 1 && c === cols - 1;
      if (!isPlayer && !isStart && !isGoal) {
        const x = offX + c * cellSize;
        const y = offY + r * cellSize;
        const dotR = Math.max(1.5, cellSize * 0.13);
        dots.push(
          <Circle
            key={key}
            cx={x + cellSize / 2} cy={y + cellSize / 2}
            r={dotR} fill="rgba(34,211,238,0.65)"
          />
        );
      }
    });
    return dots;
  }, [hintPath, playerRow, playerCol, offX, offY, cellSize, rows, cols]);

  const hintCellHighlights = useMemo(() => {
    const highlights: React.ReactNode[] = [];
    hintPath.forEach((key) => {
      const [r, c] = key.split(",").map(Number);
      const isStart = r === 0 && c === 0;
      const isGoal = r === rows - 1 && c === cols - 1;
      if (!isStart && !isGoal) {
        const x = offX + c * cellSize;
        const y = offY + r * cellSize;
        highlights.push(
          <Rect
            key={`hl-${key}`}
            x={x + 1} y={y + 1}
            width={cellSize - 1} height={cellSize - 1}
            fill="rgba(6,182,212,0.15)"
          />
        );
      }
    });
    return highlights;
  }, [hintPath, offX, offY, cellSize, rows, cols]);

  return (
    <Svg width={size} height={size}>
      <StaticGrid
        maze={maze} rows={rows} cols={cols}
        cellSize={cellSize} offX={offX} offY={offY} size={size}
      />
      {hintCellHighlights}
      {hintDots}
      <AnimatedCircle animatedProps={animatedPlayerProps} r={radius} fill="#818cf8" opacity={0.95} />
      <AnimatedCircle animatedProps={animatedGlowProps} r={radius * 0.4} fill="rgba(255,255,255,0.5)" />
    </Svg>
  );
}

// ─── D-Pad with Hold-to-Repeat ────────────────────────────────────────────────

const INITIAL_DELAY = 300;
const REPEAT_INTERVAL = 100;

interface DPadProps {
  onMove: (dr: number, dc: number) => void;
  disabled?: boolean;
}

function DPadButton({
  dr, dc, label, onMove,
}: { dr: number; dc: number; label: string; onMove: (dr: number, dc: number) => void }) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pressed, setPressed] = useState(false);

  const stopRepeat = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    setPressed(false);
  }, []);

  const startRepeat = useCallback(() => {
    setPressed(true);
    onMove(dr, dc);
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        onMove(dr, dc);
      }, REPEAT_INTERVAL);
    }, INITIAL_DELAY);
  }, [dr, dc, onMove]);

  useEffect(() => () => stopRepeat(), []);

  return (
    <Pressable
      style={[styles.dpadBtn, pressed && styles.dpadBtnPressed]}
      onPressIn={startRepeat}
      onPressOut={stopRepeat}
      delayLongPress={9999}
    >
      <Text style={[styles.dpadArrow, pressed && styles.dpadArrowPressed]}>{label}</Text>
    </Pressable>
  );
}

function DPad({ onMove }: DPadProps) {
  return (
    <View style={styles.dpadContainer}>
      <View style={styles.dpadRow}>
        <View style={styles.dpadSpacer} />
        <DPadButton dr={-1} dc={0} label="▲" onMove={onMove} />
        <View style={styles.dpadSpacer} />
      </View>
      <View style={styles.dpadRow}>
        <DPadButton dr={0} dc={-1} label="◀" onMove={onMove} />
        <View style={styles.dpadCenter} />
        <DPadButton dr={0} dc={1} label="▶" onMove={onMove} />
      </View>
      <View style={styles.dpadRow}>
        <View style={styles.dpadSpacer} />
        <DPadButton dr={1} dc={0} label="▼" onMove={onMove} />
        <View style={styles.dpadSpacer} />
      </View>
    </View>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MazeScreen() {
  const [sizeIndex, setSizeIndex] = useState(1);
  const [showHint, setShowHint] = useState(false);
  const [bestScores, setBestScores] = useState<Record<string, BestScore>>({});
  const [newRecord, setNewRecord] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const screenWidth = Dimensions.get("window").width;
  const mazeSize = Math.min(screenWidth - 32, 380);

  const [state, dispatch] = useReducer(reducer, {
    maze: [],
    playerRow: 0,
    playerCol: 0,
    moves: 0,
    timeSeconds: 0,
    status: "idle",
    cols: 15,
    rows: 15,
  });

  // Keep a ref to current state for the swipe + move handlers
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => { loadBestScores().then(setBestScores); }, []);

  const startGame = useCallback((idx: number) => {
    const { rows, cols } = MAZE_SIZES[idx];
    const maze = generateMaze(rows, cols);
    dispatch({ type: "INIT_MAZE", maze, rows, cols });
    setShowHint(false);
    setNewRecord(false);
    haptic("medium");
  }, []);

  const move = useCallback((dr: number, dc: number) => {
    const s = stateRef.current;
    if (s.status !== "playing") return;
    const { playerRow: r, playerCol: c, maze } = s;
    const cell = maze[r][c];
    const blocked =
      (dr === -1 && cell.walls.top) ||
      (dr === 1 && cell.walls.bottom) ||
      (dc === 1 && cell.walls.right) ||
      (dc === -1 && cell.walls.left);
    if (blocked) haptic("error");
    else haptic("light");
    dispatch({ type: "MOVE", dr, dc });
  }, []);

  useEffect(() => {
    if (state.status === "playing") {
      timerRef.current = setInterval(() => dispatch({ type: "TICK" }), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state.status]);

  useEffect(() => {
    if (state.status === "won") {
      haptic("success");
      const key = `${state.rows}x${state.cols}`;
      saveBestScore(key, state.timeSeconds, state.moves, bestScores).then(
        ({ updated, isNew }) => { setBestScores(updated); setNewRecord(isNew); }
      );
    }
  }, [state.status]);

  // Swipe gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
      onPanResponderRelease: (_, g) => {
        const THRESHOLD = 18;
        const { dx, dy } = g;
        if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > 0) dispatch({ type: "MOVE", dr: 0, dc: 1 });
          else dispatch({ type: "MOVE", dr: 0, dc: -1 });
        } else {
          if (dy > 0) dispatch({ type: "MOVE", dr: 1, dc: 0 });
          else dispatch({ type: "MOVE", dr: -1, dc: 0 });
        }
        haptic("light");
      },
    })
  ).current;

  const hintPath = useMemo(
    () =>
      showHint && state.maze.length > 0
        ? findPath(state.maze, state.rows, state.cols, state.playerRow, state.playerCol)
        : new Set<string>(),
    [showHint, state.maze, state.rows, state.cols, state.playerRow, state.playerCol]
  );

  const currentKey = `${state.rows}x${state.cols}`;
  const best = bestScores[currentKey];
  const idleKey = `${MAZE_SIZES[sizeIndex].rows}x${MAZE_SIZES[sizeIndex].cols}`;
  const idleBest = bestScores[idleKey];
  const hasAnyBest = Object.keys(bestScores).length > 0;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={state.status !== "playing"}
      >
        <Text style={styles.title}>Maze Game</Text>
        <Text style={styles.subtitle}>
          Navigate from{" "}
          <Text style={{ color: "#34d399", fontWeight: "bold" }}>S</Text> to{" "}
          <Text style={{ color: "#fbbf24", fontWeight: "bold" }}>G</Text>
        </Text>

        {state.status !== "idle" && (
          <View style={styles.statsBar}>
            <View style={styles.statChip}>
              <Text style={styles.statLabel}>Time</Text>
              <Text style={styles.statValue}>{formatTime(state.timeSeconds)}</Text>
              {best && <Text style={styles.statBest}>best {formatTime(best.time)}</Text>}
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statLabel}>Moves</Text>
              <Text style={styles.statValue}>{state.moves}</Text>
              {best && <Text style={styles.statBest}>best {best.moves}</Text>}
            </View>
          </View>
        )}

        {state.status === "idle" && (
          <View style={styles.sizeSelector}>
            {MAZE_SIZES.map((s, i) => {
              const bk = `${s.rows}x${s.cols}`;
              const b = bestScores[bk];
              const isGod = i === 5;
              return (
                <Pressable
                  key={i}
                  style={[
                    styles.sizeBtn,
                    sizeIndex === i && (isGod ? styles.sizeBtnGodActive : styles.sizeBtnActive),
                    isGod && styles.sizeBtnGod,
                  ]}
                  onPress={() => setSizeIndex(i)}
                >
                  <Text style={[styles.sizeBtnText, sizeIndex === i && (isGod ? styles.sizeBtnGodText : styles.sizeBtnTextActive)]}>
                    {s.label}
                  </Text>
                  <Text style={[styles.sizeBtnSub, sizeIndex === i && styles.sizeBtnSubActive]}>{s.sub}</Text>
                  {b && <Text style={styles.sizeBtnBest}>{formatTime(b.time)} / {b.moves}m</Text>}
                </Pressable>
              );
            })}
          </View>
        )}

        <View
          style={[styles.mazeContainer, { width: mazeSize, height: mazeSize }]}
          {...(state.status === "playing" ? panResponder.panHandlers : {})}
        >
          {state.maze.length > 0 && (
            <MazeCanvas
              maze={state.maze}
              rows={state.rows}
              cols={state.cols}
              playerRow={state.playerRow}
              playerCol={state.playerCol}
              hintPath={hintPath}
              size={mazeSize}
            />
          )}

          {state.status === "idle" && (
            <View style={styles.overlay}>
              <Text style={styles.overlayTitle}>Ready to play?</Text>
              <Text style={styles.overlaySubtitle}>{MAZE_SIZES[sizeIndex].label} — {MAZE_SIZES[sizeIndex].sub}</Text>
              {idleBest && <Text style={styles.overlayBest}>Best: {formatTime(idleBest.time)} in {idleBest.moves} moves</Text>}
              <Pressable style={({ pressed }) => [styles.startBtn, pressed && styles.startBtnPressed]} onPress={() => startGame(sizeIndex)}>
                <Text style={styles.startBtnText}>Start Game</Text>
              </Pressable>
            </View>
          )}

          {state.status === "won" && (
            <View style={styles.overlay}>
              <Text style={styles.winEmoji}>{newRecord ? "🏆" : "🎉"}</Text>
              <Text style={styles.winTitle}>{newRecord ? "New Record!" : "Level Complete!"}</Text>
              <View style={styles.winStats}>
                <View style={styles.winStatItem}>
                  <Text style={styles.winStatLabel}>Time</Text>
                  <Text style={styles.winStatValue}>{formatTime(state.timeSeconds)}</Text>
                  {best && !newRecord && <Text style={styles.winStatBest}>best {formatTime(best.time)}</Text>}
                </View>
                <View style={styles.winStatItem}>
                  <Text style={styles.winStatLabel}>Moves</Text>
                  <Text style={styles.winStatValue}>{state.moves}</Text>
                  {best && !newRecord && <Text style={styles.winStatBest}>best {best.moves}</Text>}
                </View>
              </View>
              {newRecord && <Text style={styles.recordLabel}>Personal best saved!</Text>}
              <View style={styles.winBtnRow}>
                <Pressable style={({ pressed }) => [styles.startBtn, pressed && styles.startBtnPressed]} onPress={() => startGame(sizeIndex)}>
                  <Text style={styles.startBtnText}>Play Again</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]} onPress={() => dispatch({ type: "RESET" })}>
                  <Text style={styles.secondaryBtnText}>Change Level</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {state.status === "playing" && (
          <View style={styles.controls}>
            <Text style={styles.swipeHint}>Swipe or hold D-pad to move continuously</Text>
            <View style={styles.hintRow}>
              <Pressable
                style={({ pressed }) => [styles.hintBtn, showHint && styles.hintBtnActive, pressed && styles.btnPressed]}
                onPress={() => { setShowHint((v) => !v); haptic("light"); }}
              >
                <Text style={[styles.hintBtnText, showHint && styles.hintBtnTextActive]}>
                  {showHint ? "Hide Hint" : "💡 Hint"}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.resetBtn, pressed && styles.btnPressed]}
                onPress={() => startGame(sizeIndex)}
              >
                <Text style={styles.resetBtnText}>New Maze</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.resetBtn, pressed && styles.btnPressed]}
                onPress={() => dispatch({ type: "RESET" })}
              >
                <Text style={styles.resetBtnText}>Change Level</Text>
              </Pressable>
            </View>
            <DPad onMove={move} />
          </View>
        )}

        {hasAnyBest && state.status === "idle" && (
          <View style={styles.bestTable}>
            <Text style={styles.bestTableTitle}>Your Best Scores</Text>
            <View style={styles.bestTableContainer}>
              <View style={styles.bestTableHeader}>
                <Text style={[styles.bestTableCell, styles.bestTableHeaderText, { flex: 1.5 }]}>Level</Text>
                <Text style={[styles.bestTableCell, styles.bestTableHeaderText, { textAlign: "right" }]}>Best Time</Text>
                <Text style={[styles.bestTableCell, styles.bestTableHeaderText, { textAlign: "right" }]}>Best Moves</Text>
              </View>
              {MAZE_SIZES.map((s, i) => {
                const b = bestScores[`${s.rows}x${s.cols}`];
                if (!b) return null;
                return (
                  <View key={i} style={styles.bestTableRow}>
                    <View style={{ flex: 1.5 }}>
                      <Text style={styles.bestTableLevel}>{s.label}</Text>
                      <Text style={styles.bestTableSub}>{s.sub}</Text>
                    </View>
                    <Text style={[styles.bestTableCell, styles.bestTimeText, { textAlign: "right" }]}>{formatTime(b.time)}</Text>
                    <Text style={[styles.bestTableCell, styles.bestMovesText, { textAlign: "right" }]}>{b.moves}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const DPAD_BTN = 66;
const DPAD_GAP = 6;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f1117" },
  scroll: { alignItems: "center", paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12 },
  title: { fontSize: 28, fontWeight: "bold", color: "#818cf8", marginBottom: 4, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: "#64748b", marginBottom: 12 },
  statsBar: { flexDirection: "row", gap: 12, marginBottom: 12, flexWrap: "wrap", justifyContent: "center" },
  statChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  statLabel: { color: "#64748b", fontSize: 13 },
  statValue: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  statBest: { color: "#475569", fontSize: 11, marginLeft: 4 },
  sizeSelector: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 14 },
  sizeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", minWidth: 70 },
  sizeBtnActive: { backgroundColor: "#4f46e5", borderColor: "#818cf8" },
  sizeBtnGod: { borderColor: "rgba(234,179,8,0.4)", backgroundColor: "rgba(234,179,8,0.05)" },
  sizeBtnGodActive: { backgroundColor: "#ca8a04", borderColor: "#fbbf24" },
  sizeBtnText: { color: "#94a3b8", fontSize: 13, fontWeight: "600" },
  sizeBtnTextActive: { color: "#fff" },
  sizeBtnGodText: { color: "#fbbf24" },
  sizeBtnSub: { color: "#475569", fontSize: 11, marginTop: 1 },
  sizeBtnSubActive: { color: "rgba(255,255,255,0.7)" },
  sizeBtnBest: { color: "#374151", fontSize: 9, marginTop: 2 },
  mazeContainer: { borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,17,23,0.93)", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 12 },
  overlayTitle: { color: "#a5b4fc", fontSize: 22, fontWeight: "bold" },
  overlaySubtitle: { color: "#94a3b8", fontSize: 14 },
  overlayBest: { color: "#475569", fontSize: 12, marginTop: -4 },
  startBtn: { backgroundColor: "#4f46e5", paddingHorizontal: 28, paddingVertical: 13, borderRadius: 13, marginTop: 4 },
  startBtnPressed: { backgroundColor: "#4338ca" },
  startBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  secondaryBtn: { backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 20, paddingVertical: 13, borderRadius: 13, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  secondaryBtnPressed: { backgroundColor: "rgba(255,255,255,0.14)" },
  secondaryBtnText: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  winEmoji: { fontSize: 44 },
  winTitle: { color: "#fbbf24", fontSize: 24, fontWeight: "bold" },
  winStats: { flexDirection: "row", gap: 32 },
  winStatItem: { alignItems: "center" },
  winStatLabel: { color: "#64748b", fontSize: 13 },
  winStatValue: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  winStatBest: { color: "#374151", fontSize: 11, marginTop: 1 },
  recordLabel: { color: "rgba(234,179,8,0.6)", fontSize: 12 },
  winBtnRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  controls: { alignItems: "center", marginTop: 14, gap: 10, width: "100%" },
  swipeHint: { color: "#374151", fontSize: 12, textAlign: "center" },
  hintRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  hintBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.05)" },
  hintBtnActive: { backgroundColor: "rgba(6,182,212,0.15)", borderColor: "rgba(6,182,212,0.5)" },
  hintBtnText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },
  hintBtnTextActive: { color: "#22d3ee" },
  resetBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.05)" },
  resetBtnText: { color: "#94a3b8", fontSize: 13, fontWeight: "600" },
  btnPressed: { opacity: 0.65 },
  dpadContainer: { alignItems: "center", gap: DPAD_GAP },
  dpadRow: { flexDirection: "row", alignItems: "center", gap: DPAD_GAP },
  dpadSpacer: { width: DPAD_BTN, height: DPAD_BTN },
  dpadBtn: { width: DPAD_BTN, height: DPAD_BTN, borderRadius: 18, backgroundColor: "#1a1f33", borderWidth: 1.5, borderColor: "#2a3050", alignItems: "center", justifyContent: "center" },
  dpadBtnPressed: { backgroundColor: "#3730a3", borderColor: "#818cf8" },
  dpadArrow: { color: "rgba(255,255,255,0.75)", fontSize: 22 },
  dpadArrowPressed: { color: "#fff" },
  dpadCenter: { width: DPAD_BTN, height: DPAD_BTN, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "#1a1f2e" },
  bestTable: { marginTop: 20, width: "100%", maxWidth: 380 },
  bestTableTitle: { color: "#475569", fontSize: 11, fontWeight: "600", textAlign: "center", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 },
  bestTableContainer: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  bestTableHeader: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.04)", paddingVertical: 8, paddingHorizontal: 12 },
  bestTableHeaderText: { color: "#475569", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  bestTableRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" },
  bestTableCell: { flex: 1, fontSize: 14 },
  bestTableLevel: { color: "#cbd5e1", fontSize: 14, fontWeight: "600" },
  bestTableSub: { color: "#475569", fontSize: 11 },
  bestTimeText: { color: "#818cf8", fontWeight: "600" },
  bestMovesText: { color: "#22d3ee", fontWeight: "600" },
});
