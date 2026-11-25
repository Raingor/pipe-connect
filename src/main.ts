import './style.css';
import { icon } from './icons';
import {
  KIND_LABELS,
  MAX_LEVEL,
  applyHint,
  cellMask,
  createLevel,
  createProgress,
  formatTime,
  hintCell,
  maskDirections,
  parseProgress,
  recordWin,
  rotateCell,
  waterState,
  type Cell,
  type Dir,
  type Level,
  type Progress,
} from './engine';

const SAVE_KEY = 'joke-bear-pipe-progress-v1';
const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('缺少应用挂载节点');
const app: HTMLDivElement = appElement;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let progress: Progress = loadProgress();
let baseLevel = createLevel(progress.unlocked);
let level = cloneLevel(baseLevel);
let moves = 0;
let hints = 0;
let startedAt: number | null = null;
let frozenMilliseconds = 0;
let won = false;
let timer: number | undefined;
let toastTimer: number | undefined;

function loadProgress(): Progress {
  try {
    return parseProgress(localStorage.getItem(SAVE_KEY));
  } catch {
    return createProgress();
  }
}

function saveProgress(): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch {
    // The game remains playable when storage is unavailable.
  }
}

function cloneLevel(source: Level): Level {
  return { ...source, cells: source.cells.map(cell => ({ ...cell })), path: [...source.path] };
}

function elapsedSeconds(): number {
  if (won) return Math.floor(frozenMilliseconds / 1000);
  if (startedAt === null) return 0;
  return Math.floor((Date.now() - startedAt) / 1000);
}

function startClock(): void {
  if (startedAt !== null || won) return;
  startedAt = Date.now();
  timer = window.setInterval(updateStats, 250);
}

function stopClock(): void {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
}

function renderShell(): void {
  app.innerHTML = `
    <div class="paper-shell">
      <header class="topbar">
        <a class="brand" href="./" aria-label="接水管首页">
          <span class="brand-mark">${icon('arrowTurn')}</span>
          <span class="brand-copy">
            <strong>接水管</strong>
            <small>JOKE BEAR'S WATERWORKS</small>
          </span>
        </a>
        <div class="level-nav" aria-label="关卡选择">
          <button class="round-button" type="button" data-action="prev-level" aria-label="上一关">${icon('chevronLeft')}</button>
          <span class="level-label">第 <strong id="level-number">${level.level}</strong> 关 <span>/ ${MAX_LEVEL}</span></span>
          <button class="round-button" type="button" data-action="next-level" aria-label="下一关">${icon('chevronRight')}</button>
        </div>
      </header>

      <main class="layout">
        <section class="game-card" aria-labelledby="game-title">
          <div class="game-heading">
            <div>
              <p class="eyebrow">小熊的花圃水路</p>
              <h1 id="game-title">把清水送到花圃</h1>
              <p class="lede">点一下管道，它就会顺时针转 90 度。让水从左边出发，顺利抵达右边。</p>
            </div>
            <div class="stat-strip" aria-label="本关数据">
              <div class="stat">
                <span>${icon('steps')} 步数</span>
                <strong id="stat-moves">0</strong>
              </div>
              <div class="stat">
                <span>${icon('timer')} 计时</span>
                <strong id="stat-time">00:00</strong>
              </div>
              <div class="stat">
                <span>${icon('bulb')} 提示</span>
                <strong id="stat-hints">0</strong>
              </div>
            </div>
          </div>

          <div class="board-card">
            <div class="board-caption">
              <span class="caption-side source">${icon('drop')} 水源</span>
              <span class="caption-note">水源在左，花圃在右</span>
              <span class="caption-side sink">花圃 ${icon('flower')}</span>
            </div>
            <div class="board-frame">
              <div id="board" class="board" aria-label="水管棋盘"></div>
            </div>
            <div class="board-legend">
              <span><i class="legend-swatch dry"></i>未通水</span>
              <span><i class="legend-swatch wet"></i>已通水</span>
              <span class="legend-tip">${icon('rotate')} 点击旋转</span>
            </div>
          </div>

          <div class="action-row">
            <button class="secondary-button" type="button" data-action="reset">${icon('reset')} 重置本关</button>
            <button class="primary-button" type="button" data-action="hint">${icon('bulb')} 提示一格</button>
            <button class="success-button" type="button" data-action="next-level" data-overlay-next hidden>下一关 ${icon('chevronRight')}</button>
          </div>
        </section>

        <aside class="bear-aside" aria-label="小熊陪伴">
          <div class="bear-card">
            <div class="bear-halo"></div>
            <img class="bear-image" src="./characters/classic.webp" alt="Joke Bear 小熊" width="320" height="320" />
            <span class="tape tape-one" aria-hidden="true"></span>
            <span class="tape tape-two" aria-hidden="true"></span>
          </div>
          <div class="bear-side-copy">
            <p class="speech-kicker">小熊说</p>
            <p id="bear-bubble" class="bear-bubble">水管都歪掉了。别担心，我们可以一格一格慢慢转回来。</p>
            <div class="mini-progress">
              <span class="mini-progress-top"><span>通关进度</span><strong id="progress-text">1 / ${MAX_LEVEL}</strong></span>
              <div class="progress-track" role="progressbar" aria-label="通关进度" aria-valuemin="0" aria-valuemax="${MAX_LEVEL}" aria-valuenow="1">
                <span id="progress-fill"></span>
              </div>
            </div>
            <div class="best-note">
              ${icon('spark')}
              <span id="best-note">这一关还没有最好成绩，慢慢来就好。</span>
            </div>
          </div>
        </aside>
      </main>

      <footer class="footer">
        <span>Joke Bear 的安静小游戏</span>
        <span class="footer-dot" aria-hidden="true"></span>
        <span>无需登录，进度保存在本机</span>
      </footer>
    </div>
    <div id="win-root"></div>
    <div id="toast" class="toast" role="status"></div>
    <div id="live" class="sr-only" aria-live="polite"></div>
  `;
  app.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeyDown);
  renderLevel();
}

function onClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const cell = target.closest<HTMLButtonElement>('[data-index]');
  if (cell) {
    handleRotate(Number(cell.dataset.index));
    return;
  }
  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'reset') resetLevel();
  if (action === 'hint') useHint();
  if (action === 'prev-level') changeLevel(-1);
  if (action === 'next-level') changeLevel(1);
  if (action === 'overlay-close') closeOverlay();
  if (action === 'overlay-replay') {
    closeOverlay();
    resetLevel();
  }
  if (action === 'overlay-next') {
    closeOverlay();
    changeLevel(1);
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key.toLowerCase() === 'r') {
    event.preventDefault();
    resetLevel();
  }
  if (event.key.toLowerCase() === 'h') {
    event.preventDefault();
    useHint();
  }
}

function renderLevel(): void {
  won = false;
  moves = 0;
  hints = 0;
  startedAt = null;
  frozenMilliseconds = 0;
  stopClock();
  document.querySelector('#win-root')!.innerHTML = '';
  const levelNumber = document.querySelector('#level-number');
  if (levelNumber) levelNumber.textContent = String(level.level);
  renderBoard();
  updateStats();
  updateBear();
  updateControls();
}

function renderBoard(focusIndex?: number): void {
  const board = document.querySelector<HTMLDivElement>('#board');
  if (!board) return;
  const water = waterState(level);
  const sourceId = level.sourceRow * level.size;
  const sinkId = level.sinkRow * level.size + level.size - 1;
  board.style.setProperty('--size', String(level.size));
  board.innerHTML = level.cells
    .map(cell => {
      const wet = water.watered.has(cell.id);
      const sourceMark = cell.id === sourceId
        ? `<span class="cell-mark source-mark" aria-hidden="true">${icon('drop')}</span>`
        : '';
      const sinkMark = cell.id === sinkId
        ? `<span class="cell-mark sink-mark" aria-hidden="true">${icon('flower')}</span>`
        : '';
      const classes = [
        'cell',
        wet ? 'watered' : '',
        cell.id === sourceId ? 'source-cell' : '',
        cell.id === sinkId ? 'sink-cell' : '',
      ].filter(Boolean).join(' ');
      return `<button
        type="button"
        class="${classes}"
        data-index="${cell.id}"
        data-kind="${cell.kind}"
        data-rotation="${cell.rotation}"
        aria-label="第 ${cell.row + 1} 行第 ${cell.col + 1} 列，${KIND_LABELS[cell.kind]}，旋转 ${cell.rotation * 90} 度${wet ? '，已通水' : ''}"
      >${pipeSvg(cell, wet)}${sourceMark}${sinkMark}</button>`;
    })
    .join('');
  board.setAttribute(
    'aria-label',
    `第 ${level.level} 关水管棋盘，${level.size} 行 ${level.size} 列。水源在第 ${level.sourceRow + 1} 行左侧，花圃在第 ${level.sinkRow + 1} 行右侧。`,
  );
  if (focusIndex !== undefined) {
    board.querySelector<HTMLButtonElement>(`[data-index="${focusIndex}"]`)?.focus({ preventScroll: true });
  }
}

function pipeSvg(cell: Cell, wet: boolean): string {
  const directions = maskDirections(cellMask(cell));
  const ends: Record<Dir, [number, number]> = {
    N: [50, 5],
    E: [95, 50],
    S: [50, 95],
    W: [5, 50],
  };
  const segments = directions
    .map(direction => {
      const [x, y] = ends[direction];
      return `<line class="pipe-body" x1="50" y1="50" x2="${x}" y2="${y}"/><line class="pipe-core" x1="50" y1="50" x2="${x}" y2="${y}"/>`;
    })
    .join('');
  return `<svg class="pipe-art${wet ? ' wet' : ''}" viewBox="0 0 100 100" aria-hidden="true">
    <g>${segments}</g>
    <circle class="pipe-hub-body" cx="50" cy="50" r="13"/>
    <circle class="pipe-hub-core" cx="50" cy="50" r="6"/>
  </svg>`;
}

function handleRotate(index: number): void {
  if (won) return;
  startClock();
  level = rotateCell(level, index);
  moves += 1;
  const cell = level.cells[index];
  renderBoard(index);
  updateStats();
  updateBear();
  const water = waterState(level);
  announce(`${KIND_LABELS[cell.kind]}已旋转。${water.solved ? '水路接通了。' : water.watered.size > 1 ? '水正在流动。' : '水还没有流动。'}`);
  if (water.solved) finishLevel();
}

function useHint(): void {
  if (won) return;
  const target = hintCell(level);
  if (!target) {
    showToast('这一关的水路已经接好了。');
    return;
  }
  startClock();
  const result = applyHint(level);
  level = result.level;
  moves += 1;
  hints += 1;
  renderBoard(result.cell?.id);
  updateStats();
  updateBear(true);
  showToast(`提示：第 ${target.row + 1} 行第 ${target.col + 1} 列的${KIND_LABELS[target.kind]}转正了。`);
  announce(`提示已使用。第 ${target.row + 1} 行第 ${target.col + 1} 列的管道旋转到正确方向。`);
  if (waterState(level).solved) finishLevel();
}

function finishLevel(): void {
  if (won) return;
  won = true;
  frozenMilliseconds = startedAt === null ? 0 : Date.now() - startedAt;
  stopClock();
  progress = recordWin(progress, level.level, {
    moves,
    seconds: elapsedSeconds(),
    hints,
  });
  saveProgress();
  renderBoard();
  updateStats();
  updateBear();
  updateControls();
  showWin();
}

function showWin(): void {
  const root = document.querySelector<HTMLDivElement>('#win-root');
  if (!root) return;
  const isFinal = level.level >= MAX_LEVEL;
  const record = progress.best[String(level.level)];
  root.innerHTML = `
    <div class="win-overlay">
      <section class="win-card" role="dialog" aria-modal="true" aria-labelledby="win-title">
        <button class="win-close" type="button" data-action="overlay-close" aria-label="关闭成绩卡">${icon('close')}</button>
        <div class="win-badge">${icon('drop')}</div>
        <p class="eyebrow">WATER REACHED THE GARDEN</p>
        <h2 id="win-title">${isFinal ? '整座花园都喝饱了' : '花圃喝到水啦'}</h2>
        <p class="win-copy">${isFinal ? '小熊把最后一段水路也修好了。谢谢你陪它走完整个花园。' : '水流顺着弯弯的管道抵达花圃，小熊捧着一小捧清水，认真地说了声谢谢。'}</p>
        <div class="win-grid">
          <div><span>本关步数</span><strong>${moves}</strong></div>
          <div><span>完成时间</span><strong>${formatTime(elapsedSeconds())}</strong></div>
          <div><span>使用提示</span><strong>${hints}</strong></div>
        </div>
        <div class="win-best">${icon('spark')} 本关最佳：${record ? `${record.moves} 步，${formatTime(record.seconds)}` : '刚刚记录'}</div>
        <div class="win-actions">
          ${isFinal
            ? `<button class="primary-button" type="button" data-action="overlay-replay">${icon('reset')} 再玩一次</button>`
            : `<button class="primary-button" type="button" data-action="overlay-next">下一关 ${icon('chevronRight')}</button>`}
          <button class="secondary-button" type="button" data-action="overlay-close">看看水路</button>
        </div>
      </section>
    </div>
  `;
  const focusTarget = root.querySelector<HTMLButtonElement>('.win-actions button');
  focusTarget?.focus();
}

function closeOverlay(): void {
  const root = document.querySelector<HTMLDivElement>('#win-root');
  if (root) root.innerHTML = '';
  updateControls();
  document.querySelector<HTMLButtonElement>('#board .cell')?.focus({ preventScroll: true });
}

function resetLevel(): void {
  if (won && document.querySelector('#win-root')?.children.length) closeOverlay();
  level = cloneLevel(baseLevel);
  renderLevel();
  showToast('本关已重置，水管回到了最初的样子。');
  announce('本关已重置。');
}

function changeLevel(delta: number): void {
  const next = Math.max(1, Math.min(MAX_LEVEL, level.level + delta));
  if (next === level.level) {
    showToast(delta > 0 ? '先完成本关，就能继续往花园深处走。' : '已经是第一关了。');
    return;
  }
  if (delta > 0 && next > progress.unlocked) {
    showToast('先完成本关，就能继续往花园深处走。');
    return;
  }
  baseLevel = createLevel(next);
  level = cloneLevel(baseLevel);
  renderLevel();
  showToast(`来到第 ${next} 关。`);
  announce(`已切换至第 ${next} 关。`);
}

function updateStats(): void {
  const movesElement = document.querySelector('#stat-moves');
  const timeElement = document.querySelector('#stat-time');
  const hintsElement = document.querySelector('#stat-hints');
  if (movesElement) movesElement.textContent = String(moves);
  if (timeElement) timeElement.textContent = formatTime(elapsedSeconds());
  if (hintsElement) hintsElement.textContent = String(hints);
}

function updateControls(): void {
  const previous = document.querySelector<HTMLButtonElement>('[data-action="prev-level"]');
  const next = document.querySelector<HTMLButtonElement>('[data-action="next-level"]');
  const hint = document.querySelector<HTMLButtonElement>('[data-action="hint"]');
  const reset = document.querySelector<HTMLButtonElement>('[data-action="reset"]');
  const inlineNext = document.querySelector<HTMLButtonElement>('[data-overlay-next]');
  if (previous) previous.disabled = level.level <= 1;
  if (next) next.disabled = level.level >= MAX_LEVEL || level.level + 1 > progress.unlocked;
  if (hint) hint.disabled = won;
  if (reset) reset.disabled = false;
  if (inlineNext) inlineNext.hidden = !won || level.level >= MAX_LEVEL;
  const progressText = document.querySelector('#progress-text');
  const fill = document.querySelector<HTMLElement>('#progress-fill');
  const track = document.querySelector('.progress-track');
  if (progressText) progressText.textContent = `${progress.unlocked} / ${MAX_LEVEL}`;
  if (fill) fill.style.width = `${(progress.unlocked / MAX_LEVEL) * 100}%`;
  if (track) track.setAttribute('aria-valuenow', String(progress.unlocked));
  const best = progress.best[String(level.level)];
  const note = document.querySelector('#best-note');
  if (note) {
    note.textContent = best
      ? `本关最佳：${best.moves} 步，${formatTime(best.seconds)}。`
      : '这一关还没有最好成绩，慢慢来就好。';
  }
}

function updateBear(afterHint = false): void {
  const bubble = document.querySelector('#bear-bubble');
  if (!bubble) return;
  const water = waterState(level);
  let message = '水管都歪掉了。别担心，我们可以一格一格慢慢转回来。';
  if (won) {
    message = '花圃喝到水啦。你听，叶子正在轻轻拍手。';
  } else if (afterHint) {
    message = '就顺着这个方向。先把靠近水源的地方接稳，再往右边看。';
  } else if (water.solved) {
    message = '水到了，花圃今天不会口渴了。';
  } else if (water.watered.size > 1) {
    const cup = Math.min(4, 1 + Math.floor(water.watered.size / Math.max(4, level.path.length / 2)));
    message = ['水已经走了一小段。', '水流在管道里唱歌。', '快到花圃了，再检查一下转弯。', '最后几格，慢一点也没关系。'][cup - 1];
  } else if (moves > 10) {
    message = '别急，先找从水源出发的那一格。水路要一格一格接过去。';
  }
  bubble.textContent = message;
}

function showToast(message: string): void {
  window.clearTimeout(toastTimer);
  const toast = document.querySelector<HTMLDivElement>('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2400);
}

function announce(message: string): void {
  const live = document.querySelector('#live');
  if (live) live.textContent = message;
}

renderShell();
if (reduceMotion) document.documentElement.classList.add('reduce-motion');
