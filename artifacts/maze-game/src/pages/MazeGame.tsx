import { useEffect, useRef, useCallback, useReducer, useState } from "react";

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

  // Iterative DFS using an explicit stack to avoid call-stack overflow on large grids
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
  // BFS from (startRow, startCol) to (rows-1, cols-1)
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
      // Return set of "row,col" strings for fast lookup
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
        nr >= 0 && nr < rows &&
        nc >= 0 && nc < cols &&
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
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) return state;
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
  { label: "Easy (10×10)", rows: 10, cols: 10 },
  { label: "Medium (15×15)", rows: 15, cols: 15 },
  { label: "Hard (20×20)", rows: 20, cols: 20 },
  { label: "Harder (30×30)", rows: 30, cols: 30 },
  { label: "Hardest (40×40)", rows: 40, cols: 40 },
  { label: "GOD (50×50)", rows: 50, cols: 50 },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function MazeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sizeIndex, setSizeIndex] = useReducer((_: number, v: number) => v, 1);
  const [showHint, setShowHint] = useState(false);

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

  // ── Start / Reset ──────────────────────────────────────────────────────────

  const startGame = useCallback(
    (idx: number) => {
      const { rows, cols } = MAZE_SIZES[idx];
      const maze = generateMaze(rows, cols);
      dispatch({ type: "INIT_MAZE", maze, rows, cols });
      setShowHint(false);
    },
    []
  );

  // ── Timer ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (state.status === "playing") {
      timerRef.current = setInterval(() => dispatch({ type: "TICK" }), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.status]);

  // ── Keyboard ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
        w: [-1, 0],
        s: [1, 0],
        a: [0, -1],
        d: [0, 1],
        W: [-1, 0],
        S: [1, 0],
        A: [0, -1],
        D: [0, 1],
      };
      const delta = map[e.key];
      if (delta) {
        e.preventDefault();
        dispatch({ type: "MOVE", dr: delta[0], dc: delta[1] });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Canvas Draw ────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || state.maze.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { rows, cols, maze, playerRow, playerCol } = state;

    // Compute cell size to fit the canvas container
    const maxW = canvas.width;
    const maxH = canvas.height;
    const cellSize = Math.floor(Math.min(maxW / cols, maxH / rows));
    const offsetX = Math.floor((maxW - cellSize * cols) / 2);
    const offsetY = Math.floor((maxH - cellSize * rows) / 2);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = "#0f1117";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Compute hint path from current player position when hint is on
    const hintPath = showHint
      ? findPath(maze, rows, cols, playerRow, playerCol)
      : new Set<string>();

    // Draw cell interiors
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = offsetX + c * cellSize;
        const y = offsetY + r * cellSize;
        const key = `${r},${c}`;
        const onPath = hintPath.has(key);

        if (onPath) {
          // Hint path — soft cyan/teal highlight
          ctx.fillStyle = "rgba(6, 182, 212, 0.22)";
        } else {
          ctx.fillStyle = "#1e2030";
        }
        ctx.fillRect(x + 1, y + 1, cellSize - 1, cellSize - 1);

        // Draw a small dot on the path cells (skip player + start + goal)
        if (
          onPath &&
          !(r === playerRow && c === playerCol) &&
          !(r === 0 && c === 0) &&
          !(r === rows - 1 && c === cols - 1)
        ) {
          const dotR = Math.max(1.5, cellSize * 0.14);
          ctx.fillStyle = "rgba(34, 211, 238, 0.65)";
          ctx.beginPath();
          ctx.arc(x + cellSize / 2, y + cellSize / 2, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw START cell
    {
      const x = offsetX;
      const y = offsetY;
      ctx.fillStyle = "rgba(52, 211, 153, 0.25)";
      ctx.fillRect(x + 1, y + 1, cellSize - 1, cellSize - 1);
      ctx.fillStyle = "#34d399";
      ctx.font = `bold ${Math.max(8, cellSize - 8)}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("S", x + cellSize / 2, y + cellSize / 2);
    }

    // Draw END cell
    {
      const x = offsetX + (cols - 1) * cellSize;
      const y = offsetY + (rows - 1) * cellSize;
      ctx.fillStyle = "rgba(251, 191, 36, 0.25)";
      ctx.fillRect(x + 1, y + 1, cellSize - 1, cellSize - 1);
      ctx.fillStyle = "#fbbf24";
      ctx.font = `bold ${Math.max(8, cellSize - 8)}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("G", x + cellSize / 2, y + cellSize / 2);
    }

    // Draw walls
    ctx.strokeStyle = "#5b6082";
    ctx.lineWidth = 2;
    ctx.lineCap = "square";

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const { walls } = maze[r][c];
        const x = offsetX + c * cellSize;
        const y = offsetY + r * cellSize;

        ctx.beginPath();
        if (walls.top) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + cellSize, y);
        }
        if (walls.right) {
          ctx.moveTo(x + cellSize, y);
          ctx.lineTo(x + cellSize, y + cellSize);
        }
        if (walls.bottom) {
          ctx.moveTo(x, y + cellSize);
          ctx.lineTo(x + cellSize, y + cellSize);
        }
        if (walls.left) {
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + cellSize);
        }
        ctx.stroke();
      }
    }

    // Draw player
    const px = offsetX + playerCol * cellSize;
    const py = offsetY + playerRow * cellSize;
    const pad = Math.max(3, Math.floor(cellSize * 0.18));
    const radius = Math.max(3, Math.floor(cellSize * 0.28));

    // Glow
    ctx.shadowColor = "#818cf8";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#818cf8";
    ctx.beginPath();
    ctx.arc(px + cellSize / 2, py + cellSize / 2, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Player highlight
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.arc(
      px + cellSize / 2 - radius * 0.2,
      py + cellSize / 2 - radius * 0.25,
      radius * 0.4,
      0,
      Math.PI * 2
    );
    ctx.fill();

    void pad;
  }, [state, showHint]);

  // ── Format time ────────────────────────────────────────────────────────────

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Canvas size ────────────────────────────────────────────────────────────

  const CANVAS_SIZE = 520;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-[#0f1117] text-white px-4 py-6"
      style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
    >
      {/* Title */}
      <h1 className="text-3xl font-bold mb-2 tracking-tight text-indigo-400">
        Maze Game
      </h1>
      <p className="text-sm text-gray-500 mb-5">
        Navigate from <span className="text-emerald-400 font-semibold">S</span> to{" "}
        <span className="text-yellow-400 font-semibold">G</span> using Arrow Keys or WASD
      </p>

      {/* Stats bar */}
      {state.status !== "idle" && (
        <div className="flex gap-6 mb-4 text-sm font-mono">
          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-2">
            <span className="text-gray-400">Time</span>
            <span className="text-white font-bold text-base">{formatTime(state.timeSeconds)}</span>
          </div>
          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-2">
            <span className="text-gray-400">Moves</span>
            <span className="text-white font-bold text-base">{state.moves}</span>
          </div>
        </div>
      )}

      {/* Size selector */}
      {state.status === "idle" && (
        <div className="flex flex-wrap gap-2 justify-center mb-6 max-w-lg">
          {MAZE_SIZES.map((s, i) => (
            <button
              key={i}
              onClick={() => setSizeIndex(i)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                i === 5
                  ? sizeIndex === i
                    ? "bg-yellow-500 border-yellow-400 text-black font-bold"
                    : "bg-yellow-900/20 border-yellow-600/40 text-yellow-400 hover:bg-yellow-900/40"
                  : sizeIndex === i
                    ? "bg-indigo-500 border-indigo-400 text-white"
                    : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div
        className="relative border border-white/10 rounded-xl overflow-hidden shadow-2xl"
        style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, background: "#0f1117" }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          style={{ display: "block" }}
        />

        {/* Idle overlay */}
        {state.status === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0f1117]/90 gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-indigo-300 mb-1">Ready to play?</p>
              <p className="text-sm text-gray-400">Choose a difficulty and start!</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center px-4 max-w-xs">
              {MAZE_SIZES.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setSizeIndex(i)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    i === 5
                      ? sizeIndex === i
                        ? "bg-yellow-500 border-yellow-400 text-black font-bold"
                        : "bg-yellow-900/20 border-yellow-600/40 text-yellow-400 hover:bg-yellow-900/40"
                      : sizeIndex === i
                        ? "bg-indigo-500 border-indigo-400 text-white"
                        : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => startGame(sizeIndex)}
              className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl font-bold text-lg transition-all shadow-lg shadow-indigo-900/50"
            >
              Start Game
            </button>
          </div>
        )}

        {/* Win overlay */}
        {state.status === "won" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0f1117]/90 gap-4">
            <div className="text-5xl mb-1">🎉</div>
            <p className="text-3xl font-bold text-yellow-400">Level Complete!</p>
            <div className="flex gap-6 text-sm font-mono mt-1">
              <div className="text-center">
                <p className="text-gray-400">Time</p>
                <p className="text-white font-bold text-xl">{formatTime(state.timeSeconds)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-400">Moves</p>
                <p className="text-white font-bold text-xl">{state.moves}</p>
              </div>
            </div>
            <button
              onClick={() => startGame(sizeIndex)}
              className="mt-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl font-bold text-lg transition-all shadow-lg shadow-indigo-900/50"
            >
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* Controls (shown while playing) */}
      {state.status === "playing" && (
        <div className="mt-5 flex flex-col items-center gap-3">
          {/* D-pad for mobile / touch */}
          <div className="flex flex-col items-center gap-1 sm:hidden">
            <button
              onPointerDown={() => dispatch({ type: "MOVE", dr: -1, dc: 0 })}
              className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white text-xl font-bold active:bg-white/30"
            >
              ▲
            </button>
            <div className="flex gap-1">
              <button
                onPointerDown={() => dispatch({ type: "MOVE", dr: 0, dc: -1 })}
                className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white text-xl font-bold active:bg-white/30"
              >
                ◄
              </button>
              <button
                onPointerDown={() => dispatch({ type: "MOVE", dr: 1, dc: 0 })}
                className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white text-xl font-bold active:bg-white/30"
              >
                ▼
              </button>
              <button
                onPointerDown={() => dispatch({ type: "MOVE", dr: 0, dc: 1 })}
                className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white text-xl font-bold active:bg-white/30"
              >
                ►
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-center max-w-lg">
            <button
              onClick={() => setShowHint((h) => !h)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold border transition-all ${
                showHint
                  ? "bg-cyan-500 border-cyan-400 text-white shadow-lg shadow-cyan-900/50"
                  : "bg-white/10 border-white/10 text-cyan-300 hover:bg-cyan-900/30 hover:border-cyan-700"
              }`}
            >
              {showHint ? "💡 Hide Hint" : "💡 Hint"}
            </button>
            <button
              onClick={() => startGame(sizeIndex)}
              className="px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-gray-200 font-medium transition-all"
            >
              New Maze
            </button>
            {MAZE_SIZES.map((s, i) => (
              <button
                key={i}
                onClick={() => { setSizeIndex(i); startGame(i); }}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all hidden sm:block ${
                  i === 5
                    ? sizeIndex === i
                      ? "bg-yellow-500/40 border-yellow-400 text-yellow-200"
                      : "bg-yellow-900/20 border-yellow-700/40 text-yellow-500 hover:bg-yellow-900/40"
                    : sizeIndex === i
                      ? "bg-indigo-500/40 border-indigo-400 text-indigo-200"
                      : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-600 hidden sm:block">
            Arrow Keys or WASD to move
          </p>
        </div>
      )}
    </div>
  );
}
