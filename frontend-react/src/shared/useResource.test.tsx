import { test, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useResource } from "./useResource";
import { api } from "./api";
vi.mock("./api", () => ({
  api: { get: vi.fn() },
  errorMessage: (e: Error) => e.message,
}));
test("changing the resource path hides the previous incident while the new request is pending", async () => {
  vi.mocked(api.get)
    .mockResolvedValueOnce({ id: "first" })
    .mockImplementationOnce(() => new Promise(() => {}));
  const { result, rerender } = renderHook(
    ({ path }) => useResource<{ id: string }>(path),
    { initialProps: { path: "/first" } },
  );
  await waitFor(() => expect(result.current.data?.id).toBe("first"));
  rerender({ path: "/second" });
  expect(result.current.data).toBeNull();
});
