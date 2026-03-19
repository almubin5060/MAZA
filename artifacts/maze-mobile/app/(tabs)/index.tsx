import React, {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Line, Rect, Text as SvgText } from "react-native-svg";
import Colors from "@/constants/colors";

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
      return (
        nr >= 0 &&
        nr < rows &&
        nc >= 0 &&
        nc < cols &&
        !grid[nr][nc].visited
      );
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
    if (r === endRow && c === endCol) {
      return new Set(path.map(([pr, pc]) => `${pr},${pc}`));
    }
    const cell = maze[r][c];
    const moves = [
      { dr: -1, dc: 0, wall: "top" as const },
      { dr: 1, dc: 0, wall: "bottom" as const },
      { dr: 0, dc: 1, wall: "right" as const },
      { dr: 0, dc: -1, wall: "left" as const },
    ];
    for (const { dr, dc, wall } of moves) {
      const nr = r + dr;
      const nc = c + dc;
      const key = `${nr},${nc}`;
      if (
        nr >= 0 &&
        nr < rows &&
        nc >= 0 &&
        nc < cols &&
        !cell.walls[wall] &&
        !visited.has(key)
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
      let wallBlocked = false;
      if (dr === -1 && cell.walls.top) wallBlocked = true;
      if (dr === 1 && cell.walls.bottom) wallBlocked = true;
      if (dc === 1 && cell.walls.right) wallBlocked = true;
      if (dc === -1 && cell.walls.left) wallBlocked = true;
      if (wallBlocked) return state;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols)
        return state;
      const won = nr === state.rows - 1 && nc === state.cols - 1;
      return {
        ...state,
        playerRow: nr,
        playerCol: nc,
        moves: state.moves + 1,
        status: won ? "won" : "playing",
      };
    }

    case "TICK":
      if (state.status !== "playing") return state;
      return { ...state, timeSeconds: state.timeSeconds + 1 };

    default:
      return state;
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAZE_SIZES = [
  { label: "Easy", sub: "10×10", rows: 10, cols: 10 },
  { label: "Medium", sub: "15×15", rows: 15, cols: 15 },
  { label: "Hard", sub: "20×20", rows: 20, cols: 20 },
  { label: "Harder", sub: "30×30", rows: 30, cols: 30 },
];

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

// ─── Maze SVG Renderer ───────────────────────────────────────────────────────

interface MazeSvgProps {
  maze: Cell[][];
  rows: number;
  cols: number;
  playerRow: number;
  playerCol: number;
  hintPath: Set<string>;
  size: number;
}

function MazeSvg({
  maze,
  rows,
  cols,
  playerRow,
  playerCol,
  hintPath,
  size,
}: MazeSvgProps) {
  const cellSize = Math.floor(size / Math.max(rows, cols));
  const totalW = cellSize * cols;
  const totalH = cellSize * rows;
  const offX = Math.floor((size - totalW) / 2);
  const offY = Math.floor((size - totalH) / 2);

  const wallLines: React.ReactNode[] = [];
  const hintDots: React.ReactNode[] = [];
  const cellRects: React.ReactNode[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offX + c * cellSize;
      const y = offY + r * cellSize;
      const key = `${r},${c}`;
      const onPath = hintPath.has(key);
      const isStart = r === 0 && c === 0;
      const isGoal = r === rows - 1 && c === cols - 1;
      const isPlayer = r === playerRow && c === playerCol;

      if (isStart) {
        cellRects.push(
          <Rect
            key={`start-${r}-${c}`}
            x={x + 1}
            y={y + 1}
            width={cellSize - 1}
            height={cellSize - 1}
            fill="rgba(34,211,153,0.25)"
          />
        );
      } else if (isGoal) {
        cellRects.push(
          <Rect
            key={`goal-${r}-${c}`}
            x={x + 1}
            y={y + 1}
            width={cellSize - 1}
            height={cellSize - 1}
            fill="rgba(251,191,36,0.25)"
          />
        );
      } else if (onPath) {
        cellRects.push(
          <Rect
            key={`hint-${r}-${c}`}
            x={x + 1}
            y={y + 1}
            width={cellSize - 1}
            height={cellSize - 1}
            fill="rgba(6,182,212,0.18)"
          />
        );
        if (!isPlayer) {
          const dotR = Math.max(1.5, cellSize * 0.14);
          hintDots.push(
            <Circle
              key={`dot-${r}-${c}`}
              cx={x + cellSize / 2}
              cy={y + cellSize / 2}
              r={dotR}
              fill="rgba(34,211,238,0.65)"
            />
          );
        }
      } else {
        cellRects.push(
          <Rect
            key={`cell-${r}-${c}`}
            x={x + 1}
            y={y + 1}
            width={cellSize - 1}
            height={cellSize - 1}
            fill="#1e2030"
          />
        );
      }

      const { walls } = maze[r][c];
      if (walls.top) {
        wallLines.push(
          <Line
            key={`wt-${r}-${c}`}
            x1={x}
            y1={y}
            x2={x + cellSize}
            y2={y}
            stroke="#5b6082"
            strokeWidth={1.5}
          />
        );
      }
      if (walls.right) {
        wallLines.push(
          <Line
            key={`wr-${r}-${c}`}
            x1={x + cellSize}
            y1={y}
            x2={x + cellSize}
            y2={y + cellSize}
            stroke="#5b6082"
            strokeWidth={1.5}
          />
        );
      }
      if (walls.bottom) {
        wallLines.push(
          <Line
            key={`wb-${r}-${c}`}
            x1={x}
            y1={y + cellSize}
            x2={x + cellSize}
            y2={y + cellSize}
            stroke="#5b6082"
            strokeWidth={1.5}
          />
        );
      }
      if (walls.left) {
        wallLines.push(
          <Line
            key={`wl-${r}-${c}`}
            x1={x}
            y1={y}
            x2={x}
            y2={y + cellSize}
            stroke="#5b6082"
            strokeWidth={1.5}
          />
        );
      }
    }
  }

  const px = offX + playerCol * cellSize;
  const py = offY + playerRow * cellSize;
  const radius = Math.max(3, Math.floor(cellSize * 0.3));
  const fontSize = Math.max(6, cellSize - 6);

  return (
    <Svg width={size} height={size}>
      <Rect x={0} y={0} width={size} height={size} fill="#0f1117" />
      {cellRects}
      {wallLines}
      {hintDots}
      <SvgText
        x={offX + cellSize / 2}
        y={offY + cellSize / 2 + fontSize * 0.36}
        fontSize={fontSize}
        fontWeight="bold"
        fill="#34d399"
        textAnchor="middle"
      >
        S
      </SvgText>
      <SvgText
        x={offX + (cols - 1) * cellSize + cellSize / 2}
        y={offY + (rows - 1) * cellSize + cellSize / 2 + fontSize * 0.36}
        fontSize={fontSize}
        fontWeight="bold"
        fill="#fbbf24"
        textAnchor="middle"
      >
        G
      </SvgText>
      <Circle
        cx={px + cellSize / 2}
        cy={py + cellSize / 2}
        r={radius}
        fill="#818cf8"
        opacity={0.9}
      />
      <Circle
        cx={px + cellSize / 2 - radius * 0.2}
        cy={py + cellSize / 2 - radius * 0.25}
        r={radius * 0.4}
        fill="rgba(255,255,255,0.5)"
      />
    </Svg>
  );
}

// ─── D-Pad ────────────────────────────────────────────────────────────────────

interface DPadProps {
  onMove: (dr: number, dc: number) => void;
}

function DPad({ onMove }: DPadProps) {
  const BTN = 64;
  const GAP = 6;

  const btn = (dr: number, dc: number, label: string) => (
    <TouchableOpacity
      style={styles.dpadBtn}
      activeOpacity={0.6}
      onPress={() => onMove(dr, dc)}
    >
      <Text style={styles.dpadArrow}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.dpadContainer}>
      <View style={styles.dpadRow}>
        <View style={{ width: BTN + GAP * 2 }} />
        {btn(-1, 0, "▲")}
        <View style={{ width: BTN + GAP * 2 }} />
      </View>
      <View style={styles.dpadRow}>
        {btn(0, -1, "◀")}
        <View style={styles.dpadCenter} />
        {btn(0, 1, "▶")}
      </View>
      <View style={styles.dpadRow}>
        <View style={{ width: BTN + GAP * 2 }} />
        {btn(1, 0, "▼")}
        <View style={{ width: BTN + GAP * 2 }} />
      </View>
    </View>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MazeScreen() {
  const [sizeIndex, setSizeIndex] = useState(1);
  const [showHint, setShowHint] = useState(false);
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

  const startGame = useCallback((idx: number) => {
    const { rows, cols } = MAZE_SIZES[idx];
    const maze = generateMaze(rows, cols);
    dispatch({ type: "INIT_MAZE", maze, rows, cols });
    setShowHint(false);
  }, []);

  const move = useCallback((dr: number, dc: number) => {
    dispatch({ type: "MOVE", dr, dc });
  }, []);

  useEffect(() => {
    if (state.status === "playing") {
      timerRef.current = setInterval(
        () => dispatch({ type: "TICK" }),
        1000
      );
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.status]);

  const hintPath =
    showHint && state.maze.length > 0
      ? findPath(
          state.maze,
          state.rows,
          state.cols,
          state.playerRow,
          state.playerCol
        )
      : new Set<string>();

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
              <Text style={styles.statValue}>
                {formatTime(state.timeSeconds)}
              </Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statLabel}>Moves</Text>
              <Text style={styles.statValue}>{state.moves}</Text>
            </View>
          </View>
        )}

        {state.status === "idle" && (
          <View style={styles.sizeSelector}>
            {MAZE_SIZES.map((s, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.sizeBtn,
                  sizeIndex === i && styles.sizeBtnActive,
                ]}
                onPress={() => setSizeIndex(i)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.sizeBtnText,
                    sizeIndex === i && styles.sizeBtnTextActive,
                  ]}
                >
                  {s.label}
                </Text>
                <Text
                  style={[
                    styles.sizeBtnSub,
                    sizeIndex === i && styles.sizeBtnSubActive,
                  ]}
                >
                  {s.sub}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View
          style={[
            styles.mazeContainer,
            { width: mazeSize, height: mazeSize },
          ]}
        >
          {state.maze.length > 0 && (
            <MazeSvg
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
              <Text style={styles.overlaySubtitle}>
                Choose a difficulty above
              </Text>
              <TouchableOpacity
                style={styles.startBtn}
                onPress={() => startGame(sizeIndex)}
                activeOpacity={0.8}
              >
                <Text style={styles.startBtnText}>Start Game</Text>
              </TouchableOpacity>
            </View>
          )}

          {state.status === "won" && (
            <View style={styles.overlay}>
              <Text style={styles.winEmoji}>🎉</Text>
              <Text style={styles.winTitle}>Level Complete!</Text>
              <View style={styles.winStats}>
                <View style={styles.winStatItem}>
                  <Text style={styles.winStatLabel}>Time</Text>
                  <Text style={styles.winStatValue}>
                    {formatTime(state.timeSeconds)}
                  </Text>
                </View>
                <View style={styles.winStatItem}>
                  <Text style={styles.winStatLabel}>Moves</Text>
                  <Text style={styles.winStatValue}>{state.moves}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.startBtn}
                onPress={() => startGame(sizeIndex)}
                activeOpacity={0.8}
              >
                <Text style={styles.startBtnText}>Play Again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {state.status === "playing" && (
          <View style={styles.controls}>
            <View style={styles.hintRow}>
              <TouchableOpacity
                style={[styles.hintBtn, showHint && styles.hintBtnActive]}
                onPress={() => setShowHint((v) => !v)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.hintBtnText,
                    showHint && styles.hintBtnTextActive,
                  ]}
                >
                  {showHint ? "Hide Hint" : "Show Hint"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => startGame(sizeIndex)}
                activeOpacity={0.7}
              >
                <Text style={styles.resetBtnText}>Restart</Text>
              </TouchableOpacity>
            </View>
            <DPad onMove={move} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f1117",
  },
  scroll: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#818cf8",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 12,
  },
  statsBar: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statLabel: {
    color: "#64748b",
    fontSize: 13,
  },
  statValue: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    fontVariant: ["tabular-nums"],
  },
  sizeSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginBottom: 14,
  },
  sizeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    minWidth: 72,
  },
  sizeBtnActive: {
    backgroundColor: "#4f46e5",
    borderColor: "#818cf8",
  },
  sizeBtnText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
  },
  sizeBtnTextActive: {
    color: "#fff",
  },
  sizeBtnSub: {
    color: "#475569",
    fontSize: 11,
    marginTop: 1,
  },
  sizeBtnSubActive: {
    color: "rgba(255,255,255,0.7)",
  },
  mazeContainer: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    position: "relative",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,17,23,0.92)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderRadius: 12,
  },
  overlayTitle: {
    color: "#a5b4fc",
    fontSize: 22,
    fontWeight: "bold",
  },
  overlaySubtitle: {
    color: "#64748b",
    fontSize: 14,
  },
  startBtn: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 4,
  },
  startBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
  },
  winEmoji: {
    fontSize: 48,
  },
  winTitle: {
    color: "#fbbf24",
    fontSize: 26,
    fontWeight: "bold",
  },
  winStats: {
    flexDirection: "row",
    gap: 32,
  },
  winStatItem: {
    alignItems: "center",
  },
  winStatLabel: {
    color: "#64748b",
    fontSize: 13,
  },
  winStatValue: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },
  controls: {
    alignItems: "center",
    marginTop: 16,
    gap: 12,
    width: "100%",
  },
  hintRow: {
    flexDirection: "row",
    gap: 12,
  },
  hintBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  hintBtnActive: {
    backgroundColor: "rgba(6,182,212,0.15)",
    borderColor: "rgba(6,182,212,0.5)",
  },
  hintBtnText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
  },
  hintBtnTextActive: {
    color: "#22d3ee",
  },
  resetBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  resetBtnText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
  },
  dpadContainer: {
    alignItems: "center",
    gap: 6,
  },
  dpadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dpadBtn: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "#1a1f33",
    borderWidth: 1,
    borderColor: "#252b45",
    alignItems: "center",
    justifyContent: "center",
  },
  dpadArrow: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 22,
  },
  dpadCenter: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "#1e2438",
  },
});
