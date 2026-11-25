import { describe, expect, it } from 'vitest';
import {
  MAX_LEVEL,
  applyHint,
  cellMask,
  createLevel,
  createProgress,
  formatTime,
  hintCell,
  isSolved,
  maskFor,
  parseProgress,
  pathLength,
  recordWin,
  rotateCell,
  rotateMask,
  solvedPathCount,
  waterState,
  type Level,
} from './engine';

const makeLevel = (seed = 7, level = 1): Level => createLevel(level, (() => {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
})());

function solvePath(level: Level): Level {
  return {
    ...level,
    cells: level.cells.map(cell =>
      cell.onPath ? { ...cell, rotation: cell.solvedRotation } : cell,
    ),
  };
}

describe('pipe generator', () => {
  it('builds a connected, non-trivial path inside the grid', () => {
    const level = makeLevel(11);
    expect(level.size).toBe(5);
    expect(pathLength(level)).toBeGreaterThanOrEqual(level.size);
    const seen = new Set<number>();
    level.path.forEach(id => {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      const cell = level.cells[id];
      expect(cell.row).toBeGreaterThanOrEqual(0);
      expect(cell.row).toBeLessThan(level.size);
      expect(cell.col).toBeGreaterThanOrEqual(0);
      expect(cell.col).toBeLessThan(level.size);
    });
    expect(level.cells[level.path[0]].col).toBe(0);
    expect(level.cells[level.path.at(-1)!].col).toBe(level.size - 1);
  });

  it('uses all four pipe kinds somewhere on the board', () => {
    const level = makeLevel(23, 3);
    const kinds = new Set(level.cells.map(cell => cell.kind));
    expect(kinds.size).toBe(4);
  });

  it('connects source to outlet when path cells are rotated to their solved state', () => {
    const level = solvePath(makeLevel(31));
    const water = waterState(level);
    expect(water.sourceConnected).toBe(true);
    expect(water.solved).toBe(true);
    expect(water.watered.size).toBeGreaterThanOrEqual(level.path.length);
    expect(isSolved(level)).toBe(true);
  });

  it('starts scrambled without an instant win', () => {
    for (const seed of [3, 9, 17, 42, 81]) {
      const level = makeLevel(seed);
      expect(isSolved(level)).toBe(false);
      expect(solvedPathCount(level)).toBeLessThan(level.path.length);
    }
  });

  it('rotates a mask through four quarter turns back to itself', () => {
    const masks = [1, 2, 4, 8, 3, 6, 12, 9, 7, 15];
    masks.forEach(mask => {
      let rotated = mask;
      for (let turn = 0; turn < 4; turn += 1) rotated = rotateMask(rotated, 1);
      expect(rotated).toBe(mask);
      expect(rotateMask(mask, 4)).toBe(mask);
    });
  });

  it('moves a cell exactly one quarter turn per rotation', () => {
    const level = makeLevel(5);
    const cell = level.cells[10];
    const rotated = rotateCell(level, cell.id).cells[cell.id];
    expect(rotated.rotation).toBe((cell.rotation + 1) % 4);
    expect(rotated.kind).toBe(cell.kind);
  });

  it('does not count an outlet as solved when its east opening is turned away', () => {
    const level = solvePath(makeLevel(51));
    const sink = level.cells[level.sinkRow * level.size + level.size - 1];
    const candidates = [0, 1, 2, 3].filter(rotation => {
      const mask = maskFor(sink.kind, rotation);
      return (mask & 2) === 0;
    });
    expect(candidates.length).toBeGreaterThan(0);
    const broken: Level = {
      ...level,
      cells: level.cells.map(cell =>
        cell.id === sink.id ? { ...cell, rotation: candidates[0] } : cell,
      ),
    };
    expect(isSolved(broken)).toBe(false);
  });

  it('returns a useful hint and advances the solved path count', () => {
    const level = makeLevel(63);
    const hint = hintCell(level);
    expect(hint).not.toBeNull();
    expect(hint?.onPath).toBe(true);
    const before = solvedPathCount(level);
    const result = applyHint(level);
    expect(result.cell?.id).toBe(hint?.id);
    expect(solvedPathCount(result.level)).toBeGreaterThan(before);
  });

  it('increases grid size with level and clamps invalid levels', () => {
    expect(makeLevel(1, 1).size).toBe(5);
    expect(makeLevel(1, 3).size).toBe(6);
    expect(makeLevel(1, 6).size).toBe(7);
    expect(makeLevel(1, 99).level).toBe(MAX_LEVEL);
    expect(makeLevel(1, 0).level).toBe(1);
  });

  it('validates and merges saved progress safely', () => {
    expect(parseProgress(null)).toEqual(createProgress());
    expect(parseProgress('not json').unlocked).toBe(1);
    const parsed = parseProgress(JSON.stringify({ unlocked: 4, best: { '1': { moves: 12, seconds: 30, hints: 1 } } }));
    expect(parsed.unlocked).toBe(4);
    expect(parsed.best['1'].moves).toBe(12);
    const first = recordWin(createProgress(), 1, { moves: 12, seconds: 40, hints: 0 }, new Date('2026-01-01'));
    expect(first.unlocked).toBe(2);
    const faster = recordWin(first, 1, { moves: 18, seconds: 25, hints: 0 }, new Date('2026-01-02'));
    expect(faster.best['1'].seconds).toBe(25);
    const slower = recordWin(faster, 1, { moves: 8, seconds: 55, hints: 0 });
    expect(slower.best['1'].seconds).toBe(25);
  });

  it('formats timer values with stable two-digit fields', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(-4)).toBe('00:00');
  });

  it('keeps cell masks within four bits while rotating', () => {
    for (let rotation = 0; rotation < 8; rotation += 1) {
      expect(cellMask({
        id: 0, row: 0, col: 0, kind: 'cross', rotation, solvedRotation: 0, onPath: true,
      })).toBe(15);
    }
  });
});
