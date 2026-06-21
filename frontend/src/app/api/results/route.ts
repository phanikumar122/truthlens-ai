import { NextResponse } from 'next/server';

/**
 * Server-side proxy to the TruthLens backend.
 *
 * - Targets the local backend via BACKEND_URL env (default: http://localhost:8000).
 * - Adds a short in-memory TTL cache so the same payload isn't re-fetched on every
 *   client poll, while still staying fresh (5s). Keeps latency off the browser.
 * - Uses keepalive + a generous timeout to tolerate the backend's first (cold) call.
 */

const BACKEND_URL = process.env.BACKEND_URL || "https://cybersoul18-truthlens-backend.hf.space";

const TTL_MS = 5_000;
let cache: { at: number; data: unknown } | null = null;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const now = Date.now();

  // Serve from cache if fresh
  if (cache && now - cache.at < TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: {
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
        "X-TruthLens-Cache": "HIT",
      },
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    const response = await fetch(`${BACKEND_URL}/results`, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      // @ts-expect-error keepalive is valid in the runtime; lib dom typings are patchy
      keepalive: true,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Backend responded ${response.status}` },
        { status: 502 },
      );
    }

    const data = await response.json();
    cache = { at: now, data };

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
        "X-TruthLens-Cache": "MISS",
      },
    });
  } catch (error) {
    console.error("Proxy Error:", error);
    return NextResponse.json({ error: "Failed to fetch from backend" }, { status: 500 });
  }
}
