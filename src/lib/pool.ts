import type { Intent } from "@/types/intent";

// Keep a single array across hot reloads
const g = globalThis as unknown as { __POOL__?: Intent[] };
export const pool: Intent[] = g.__POOL__ ?? (g.__POOL__ = []);