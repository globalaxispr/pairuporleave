/**
 * Admin Navigation Performance Instrumentation
 * DEV-ONLY — completely dead code in production builds (Vite tree-shakes
 * all code behind import.meta.env.DEV === false at build time).
 */

const DEV = import.meta.env.DEV;

let navStart = 0;
let navTo = "";

export function perfNavStart(from: string, to: string) {
  if (!DEV) return;
  navStart = performance.now();
  navTo = to;
  console.group(`[ADMIN PERF] ${from} -> ${to}`);
}

export function perfMark(label: string) {
  if (!DEV) return;
  const elapsed = (performance.now() - navStart).toFixed(1);
  console.log(`  [+${elapsed}ms] ${label}`);
}

export function perfNavEnd(label = "Total") {
  if (!DEV) return;
  const total = (performance.now() - navStart).toFixed(1);
  console.log(`  ----------------------------`);
  console.log(`  ${label}: ${total}ms`);
  console.groupEnd();
}

export function perfPageMount(pageName: string) {
  if (!DEV) return;
  const elapsed = navStart > 0 ? (performance.now() - navStart).toFixed(1) : "n/a";
  console.log(`[ADMIN PERF] ${pageName} mounted (+${elapsed}ms from last nav)`);
}