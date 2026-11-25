export type PipeKind = 'straight' | 'elbow' | 'tee' | 'cross';
export type Dir = 'N' | 'E' | 'S' | 'W';

export interface Cell {
  id: number;
  row: number;
  col: number;
  kind: PipeKind;
  rotation: number;
  solvedRotation: number;
  onPath: boolean;
}

export interface Level {
  level: number;
  size: number;
  sourceRow: number;
  sinkRow: number;
  cells: Cell[];
  path: number[];
}

export interface WaterResult {
  watered: Set<number>;
  sourceConnected: boolean;
  solved: boolean;
}

export interface LevelResult {
  moves: number;
  seconds: number;
  hints: number;
}

export interface BestRecord extends LevelResult {
  at: string;
}

export interface Progress {
  unlocked: number;
  best: Record<string, BestRecord>;
}

export const MAX_LEVEL = 8;
export const PIPE_KINDS: PipeKind[] = ['straight', 'elbow', 'tee', 'cross'];
export const KIND_LABELS: Record<PipeKind, string> = {
  straight: '直管',
  elbow: '弯管',
  tee: '三通',
  cross: '十字管',
};

const BASE_MASK: Record<PipeKind, number> = {
  straight: 1 | 4,
  elbow: 1 | 2,
  tee: 1 | 2 | 4,
  cross: 1 | 2 | 4 | 8,
};

const BITS: Record<Dir, number> = { N: 1, E: 2, S: 4, W: 8 };
const DIRECTIONS: Dir[] = ['N', 'E', 'S', 'W'];
const OPPOSITE: Record<Dir, Dir> = { N: 'S', E: 'W', S: 'N', W: 'E' };
const DELTA: Record<Dir, [number, number]> = {
  N: [-1, 0],
  E: [0, 1],
  S: [1, 0],
  W: [0, -1],
};

export function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rotateMask(mask: number, turns: number): number {
  let result = mask & 15;
  const count = ((turns % 4) + 4) % 4;
  for (let turn = 0; turn < count; turn += 1) {
    result = ((result << 1) & 15) | (result >> 3);
  }
  return result;
}

export function maskFor(kind: PipeKind, rotation: number): number {
  return rotateMask(BASE_MASK[kind], rotation);
}

export function cellMask(cell: Cell): number {
  return maskFor(cell.kind, cell.rotation);
}

export function maskDirections(mask: number): Dir[] {
  return DIRECTIONS.filter(direction => (mask & BITS[direction]) !== 0);
}

export function rotationForMask(kind: PipeKind, target: number): number {
  for (let rotation = 0; rotation < 4; rotation += 1) {
    if (maskFor(kind, rotation) === target) return rotation;
  }
  return 0;
}

function pathDirection(from: { row: number; col: number }, to: { row: number; col: number }): Dir {
  if (to.row < from.row) return 'N';
  if (to.row > from.row) return 'S';
  if (to.col > from.col) return 'E';
  return 'W';
}

function kindForMask(mask: number): PipeKind {
  const count = maskDirections(mask).length;
  if (count === 4) return 'cross';
  if (count === 3) return 'tee';
  if (count === 2) {
    const [first, second] = maskDirections(mask);
    return OPPOSITE[first] === second ? 'straight' : 'elbow';
  }
  return 'straight';
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function randomPath(
  size: number,
  sourceRow: number,
  sinkRow: number,
  random: () => number,
): Array<{ row: number; col: number }> {
  const start = { row: sourceRow, col: 0 };
  const target = { row: sinkRow, col: size - 1 };
  const visited = new Set<string>();
  const path: Array<{ row: number; col: number }> = [];
  let attempts = 0;

  const walk = (row: number, col: number): boolean => {
    attempts += 1;
    if (attempts > 120000) return false;
    const key = `${row}:${col}`;
    if (visited.has(key)) return false;
    visited.add(key);
    path.push({ row, col });
    if (row === target.row && col === target.col) return true;

    const options = shuffle(DIRECTIONS, random)
      .map(direction => {
        const [dr, dc] = DELTA[direction];
        return { row: row + dr, col: col + dc };
      })
      .filter(next => next.row >= 0 && next.row < size && next.col >= 0 && next.col < size)
      .filter(next => !visited.has(`${next.row}:${next.col}`));

    for (const next of options) {
      if (walk(next.row, next.col)) return true;
    }
    path.pop();
    visited.delete(key);
    return false;
  };

  if (walk(start.row, start.col) && path.length >= size + 1) return path;

  path.length = 0;
  if (sourceRow === sinkRow) {
    for (let col = 0; col < size; col += 1) path.push({ row: sourceRow, col });
    return path;
  }

  path.push({ row: sourceRow, col: 0 }, { row: sourceRow, col: 1 });
  const step = sinkRow > sourceRow ? 1 : -1;
  for (let row = sourceRow + step; row !== sinkRow + step; row += step) {
    path.push({ row, col: 1 });
  }
  for (let col = 2; col < size; col += 1) path.push({ row: sinkRow, col });
  return path;
}

function makePathCells(size: number, path: Array<{ row: number; col: number }>): Map<number, number> {
  const masks = new Map<number, number>();
  path.forEach((point, index) => {
    let mask = 0;
    if (index > 0) mask |= BITS[pathDirection(point, path[index - 1])];
    if (index < path.length - 1) mask |= BITS[pathDirection(point, path[index + 1])];
    if (index === 0) mask |= BITS.W;
    if (index === path.length - 1) mask |= BITS.E;
    masks.set(point.row * size + point.col, mask);
  });
  return masks;
}

export function createLevel(levelNumber: number, random: () => number = Math.random): Level {
  const level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(levelNumber)));
  const size = level <= 2 ? 5 : level <= 4 ? 6 : 7;
  const sourceRow = Math.floor(random() * size);
  const sinkRow = Math.floor(random() * size);
  const path = randomPath(size, sourceRow, sinkRow, random);
  const pathMasks = makePathCells(size, path);
  const pathIds = path.map(point => point.row * size + point.col);
  const decoyPositions: number[] = [];

  for (let id = 0; id < size * size; id += 1) {
    if (!pathMasks.has(id)) decoyPositions.push(id);
  }

  const decoyKinds = shuffle(PIPE_KINDS, random);
  const cells: Cell[] = [];
  for (let id = 0; id < size * size; id += 1) {
    const row = Math.floor(id / size);
    const col = id % size;
    const controlledMask = pathMasks.get(id);
    if (controlledMask !== undefined) {
      const kind = kindForMask(controlledMask);
      const solvedRotation = rotationForMask(kind, controlledMask);
      const alternatives = [0, 1, 2, 3].filter(
        rotation => maskFor(kind, rotation) !== controlledMask,
      );
      const rotation = alternatives.length
        ? alternatives[Math.floor(random() * alternatives.length)]
        : solvedRotation;
      cells.push({
        id,
        row,
        col,
        kind,
        rotation,
        solvedRotation,
        onPath: true,
      });
      continue;
    }

    const decoyIndex = decoyPositions.indexOf(id);
    const kind = decoyIndex < 4
      ? decoyKinds[decoyIndex]
      : PIPE_KINDS[Math.floor(random() * PIPE_KINDS.length)];
    const rotation = Math.floor(random() * 4);
    cells.push({
      id,
      row,
      col,
      kind,
      rotation,
      solvedRotation: rotation,
      onPath: false,
    });
  }

  let result: Level = { level, size, sourceRow, sinkRow, cells, path: pathIds };
  if (isSolved(result)) {
    const firstPath = cells[pathIds[1]];
    firstPath.rotation = (firstPath.rotation + 1) % 4;
    result = { ...result, cells };
  }
  return result;
}

export function rotateCell(level: Level, id: number): Level {
  return {
    ...level,
    cells: level.cells.map(cell =>
      cell.id === id ? { ...cell, rotation: (cell.rotation + 1) % 4 } : cell,
    ),
  };
}

export function waterState(level: Level): WaterResult {
  const source = level.cells[level.sourceRow * level.size];
  const sink = level.cells[level.sinkRow * level.size + level.size - 1];
  const watered = new Set<number>();
  if (!(cellMask(source) & BITS.W)) {
    return { watered, sourceConnected: false, solved: false };
  }

  const queue: Cell[] = [source];
  watered.add(source.id);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const cell = queue[cursor];
    const open = maskDirections(cellMask(cell));
    for (const direction of open) {
      const [dr, dc] = DELTA[direction];
      const row = cell.row + dr;
      const col = cell.col + dc;
      if (row < 0 || row >= level.size || col < 0 || col >= level.size) continue;
      const neighbour = level.cells[row * level.size + col];
      if (!(cellMask(neighbour) & BITS[OPPOSITE[direction]])) continue;
      if (watered.has(neighbour.id)) continue;
      watered.add(neighbour.id);
      queue.push(neighbour);
    }
  }

  return {
    watered,
    sourceConnected: true,
    solved: watered.has(sink.id) && (cellMask(sink) & BITS.E) !== 0,
  };
}

export function isSolved(level: Level): boolean {
  return waterState(level).solved;
}

export function isPathCell(level: Level, id: number): boolean {
  return level.path.includes(id);
}

export function hintCell(level: Level): Cell | null {
  const water = waterState(level);
  const wrong = level.cells.filter(cell =>
    cell.onPath && cellMask(cell) !== maskFor(cell.kind, cell.solvedRotation),
  );
  if (!wrong.length) return null;
  return (
    wrong.find(cell => !water.watered.has(cell.id)) ??
    wrong.find(cell => water.watered.has(cell.id)) ??
    null
  );
}

export function applyHint(level: Level): { level: Level; cell: Cell | null } {
  const target = hintCell(level);
  if (!target) return { level, cell: null };
  return {
    level: {
      ...level,
      cells: level.cells.map(cell =>
        cell.id === target.id ? { ...cell, rotation: cell.solvedRotation } : cell,
      ),
    },
    cell: target,
  };
}

export function solvedPathCount(level: Level): number {
  return level.cells.filter(
    cell => cell.onPath && cellMask(cell) === maskFor(cell.kind, cell.solvedRotation),
  ).length;
}

export function pathLength(level: Level): number {
  return level.path.length;
}

export function createProgress(): Progress {
  return { unlocked: 1, best: {} };
}

export function parseProgress(raw: string | null): Progress {
  if (!raw) return createProgress();
  try {
    const parsed = JSON.parse(raw) as Partial<Progress>;
    if (!parsed || typeof parsed !== 'object') return createProgress();
    const unlocked = Number.isFinite(parsed.unlocked)
      ? Math.max(1, Math.min(MAX_LEVEL, Math.floor(parsed.unlocked as number)))
      : 1;
    const best: Record<string, BestRecord> = {};
    if (parsed.best && typeof parsed.best === 'object') {
      for (const [key, value] of Object.entries(parsed.best)) {
        if (!value || typeof value !== 'object') continue;
        const record = value as Partial<BestRecord>;
        if (
          Number.isFinite(record.moves) &&
          Number.isFinite(record.seconds) &&
          Number.isFinite(record.hints)
        ) {
          best[key] = {
            moves: Math.max(1, Math.floor(record.moves as number)),
            seconds: Math.max(0, Math.floor(record.seconds as number)),
            hints: Math.max(0, Math.floor(record.hints as number)),
            at: typeof record.at === 'string' ? record.at : '',
          };
        }
      }
    }
    return { unlocked, best };
  } catch {
    return createProgress();
  }
}

function betterThan(candidate: LevelResult, previous: BestRecord | undefined): boolean {
  if (!previous) return true;
  if (candidate.seconds !== previous.seconds) return candidate.seconds < previous.seconds;
  return candidate.moves < previous.moves;
}

export function recordWin(
  progress: Progress,
  level: number,
  result: LevelResult,
  now = new Date(),
): Progress {
  const key = String(level);
  const previous = progress.best[key];
  const best = betterThan(result, previous)
    ? { ...result, at: now.toISOString() }
    : previous;
  return {
    unlocked: Math.max(progress.unlocked, Math.min(MAX_LEVEL, level + 1)),
    best: best === previous ? progress.best : { ...progress.best, [key]: best },
  };
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
