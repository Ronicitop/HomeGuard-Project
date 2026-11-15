import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "./api";
export function useResource<T>(path: string, interval = 0, enabled = true) {
  const [result, setResult] = useState<{ path: string; data: T } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    api
      .get<T>(path, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) {
          setResult({ path, data: value });
          setError("");
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [path, version, enabled]);
  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("hg:refresh", reload);
    const timer = interval ? setInterval(reload, interval) : undefined;
    return () => {
      window.removeEventListener("hg:refresh", reload);
      if (timer) clearInterval(timer);
    };
  }, [reload, interval, enabled]);
  return {
    data: enabled && result?.path === path ? result.data : null,
    error,
    loading,
    reload,
  };
}
