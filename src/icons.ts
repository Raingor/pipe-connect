const paths: Record<string, string> = {
  drop: '<path d="M12 3S5 11 5 16a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/><path d="M9 17a3 3 0 0 0 3 2"/>',
  flower: '<path d="M12 21v-8m0 5 5-2M12 6c-5-8-10 2-4 4-8 4 0 10 4 4 4 6 12 0 4-4 6-2 1-12-4-4Z"/>',
  rotate: '<path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 0-1.5 5.7"/>',
  reset: '<path d="M4 4v6h6"/><path d="M5.5 10A8 8 0 1 1 4 15"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M8 14a6 6 0 1 1 8 0c-1 .8-1.3 1.8-1.3 2.5H9.3c0-.7-.3-1.7-1.3-2.5Z"/>',
  home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  steps: '<path d="M8 4h8M7 9h10M6 14h12M5 19h14"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  spark: '<path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8Z"/>',
  thumb: '<path d="M7 10v11H3V10h4Zm0 10h10a3 3 0 0 0 3-3l1-5a2 2 0 0 0-2-2h-5l1-4a3 3 0 0 0-5-1l-3 5v10Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  arrowTurn: '<path d="M4 8h10a5 5 0 0 1 0 10h-5"/><path d="m8 5-4 3 4 3"/>',
};

export function icon(name: string, className = ''): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}
