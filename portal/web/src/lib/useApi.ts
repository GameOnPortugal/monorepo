import { useEffect, useState } from "react";

export type LoadState = "loading" | "error" | "empty" | "ready";

/**
 * The loading/error/empty/ready fetch pattern M8.5's Home.tsx established
 * per-section (three near-identical `useEffect`+`useState` blocks) —
 * factored out here so M8.6-M8.9's pages call one hook instead of copying
 * that boilerplate again. `isEmpty` decides "empty" vs "ready" (default:
 * an array with no elements) since not every response is a bare array.
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  isEmpty: (value: T) => boolean = (value) => Array.isArray(value) && value.length === 0,
): { state: LoadState; data: T | undefined } {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<T | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetcher()
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setState(isEmpty(value) ? "empty" : "ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { state, data };
}
