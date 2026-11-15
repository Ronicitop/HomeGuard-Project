import { afterEach, test, expect, vi } from "vitest";
import { api } from "./api";
afterEach(() => vi.unstubAllGlobals());
test("a cancelled or malformed response body never becomes successful empty data", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new DOMException("Cancelled", "AbortError")),
      }),
  );
  await expect(api.get("/health")).rejects.toThrow();
});
