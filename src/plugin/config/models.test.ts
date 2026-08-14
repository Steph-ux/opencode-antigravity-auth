import { describe, expect, it } from "vitest";

import { OPENCODE_MODEL_DEFINITIONS } from "./models";

const getModel = (name: string) => {
  const model = OPENCODE_MODEL_DEFINITIONS[name];
  if (!model) {
    throw new Error(`Missing model definition for ${name}`);
  }
  return model;
};

describe("OPENCODE_MODEL_DEFINITIONS", () => {
  it("includes only the working Antigravity models", () => {
    const modelNames = Object.keys(OPENCODE_MODEL_DEFINITIONS).sort();

    expect(modelNames).toEqual([
      "antigravity-claude-opus-4-6-thinking",
      "antigravity-claude-sonnet-4-6",
      "antigravity-gemini-3.6-flash-tiered",
      "antigravity-gemini-3.7-flash",
    ]);
  });

  it("defines thinking tier variants for Gemini 3.7 Flash", () => {
    expect(getModel("antigravity-gemini-3.7-flash").variants).toEqual({
      low: { thinkingLevel: "low" },
      medium: { thinkingLevel: "medium" },
      high: { thinkingLevel: "high" },
    });
    expect(getModel("antigravity-gemini-3.7-flash").limit).toEqual({
      context: 1048576,
      output: 65536,
    });
  });

  it("defines the Gemini 3.6 Flash Tiered model without variants", () => {
    expect(getModel("antigravity-gemini-3.6-flash-tiered").variants).toBeUndefined();
    expect(getModel("antigravity-gemini-3.6-flash-tiered").limit).toEqual({
      context: 1048576,
      output: 65536,
    });
  });

  it("defines thinking budget variants for Claude thinking models", () => {
    expect(getModel("antigravity-claude-opus-4-6-thinking").variants).toEqual({
      low: { thinkingConfig: { thinkingBudget: 8192 } },
      max: { thinkingConfig: { thinkingBudget: 32768 } },
    });
  });
});
