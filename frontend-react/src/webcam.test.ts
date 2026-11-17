import { test, expect } from "vitest";
import { webcamSource } from "./surveillance";
test("explicit default webcam overrides a saved device from another browser", () => {
  expect(webcamSource(undefined, "saved-id")).toEqual({
    deviceId: { exact: "saved-id" },
  });
  expect(webcamSource("", "saved-id")).toEqual({});
  expect(webcamSource("new-id", "saved-id")).toEqual({
    deviceId: { exact: "new-id" },
  });
});
