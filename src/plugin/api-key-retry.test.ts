import { beforeAll, describe, expect, it, vi } from "vitest";

type IsApiKeyErrorResponse = (response: {
  clone(): { text(): Promise<string> };
}) => Promise<boolean>;

let isApiKeyErrorResponse: IsApiKeyErrorResponse | undefined;

beforeAll(async () => {
  vi.mock("@opencode-ai/plugin", () => ({
    tool: vi.fn(),
  }));

  const { __testExports } = await import("../plugin");
  isApiKeyErrorResponse = (__testExports as {
    isApiKeyErrorResponse?: IsApiKeyErrorResponse;
  }).isApiKeyErrorResponse;
});

describe("api key error detection", () => {
  it("detects an invalid API key error body", async () => {
    const response = {
      clone: () => ({
        text: () =>
          Promise.resolve("API key not valid. Please pass a valid API key."),
      }),
    };

    expect(await isApiKeyErrorResponse?.(response)).toBe(true);
  });

  it("detects an api_key error body", async () => {
    const response = {
      clone: () => ({
        text: () =>
          Promise.resolve('{"error": "Invalid api_key provided"}'),
      }),
    };

    expect(await isApiKeyErrorResponse?.(response)).toBe(true);
  });

  it("ignores unrelated error bodies", async () => {
    const response = {
      clone: () => ({
        text: () => Promise.resolve("The requested model is not available"),
      }),
    };

    expect(await isApiKeyErrorResponse?.(response)).toBe(false);
  });

  it("returns false when reading the response body fails", async () => {
    const response = {
      clone: () => ({
        text: () => Promise.reject(new Error("stream interrupted")),
      }),
    };

    expect(await isApiKeyErrorResponse?.(response)).toBe(false);
  });
});
