import { describe, it, expect } from "vitest";
import { pruneLargeString, pruneMessagesContext } from "./smart-pruner";

describe("Smart Context Pruner", () => {
  it("leaves small strings untouched", () => {
    const small = "Hello, world!";
    expect(pruneLargeString(small, 50)).toBe(small);
  });

  it("prunes large strings in the middle", () => {
    const large = "A".repeat(500) + "B".repeat(2000) + "C".repeat(500);
    const pruned = pruneLargeString(large, 1000, 200, 200);

    expect(pruned.length).toBeLessThan(large.length);
    expect(pruned.startsWith("A".repeat(200))).toBe(true);
    expect(pruned.endsWith("C".repeat(200))).toBe(true);
    expect(pruned).toContain("pruned for context optimization");
  });

  it("preserves the most recent messages untouched", () => {
    const messages = [
      { role: "user", content: "Large old tool result: " + "X".repeat(5000) },
      { role: "assistant", content: "Understood." },
      { role: "user", content: "Recent message: " + "Y".repeat(5000) },
    ];

    const pruned = pruneMessagesContext(messages, { preserveRecentCount: 2 });

    // First message should be pruned
    expect(pruned[0].content.length).toBeLessThan(5000);
    expect(pruned[0].content).toContain("pruned for context optimization");

    // Second and third (recent) messages must remain untouched
    expect(pruned[1].content).toBe("Understood.");
    expect(pruned[2].content).toBe("Recent message: " + "Y".repeat(5000));
  });

  it("correctly prunes Claude tool_result content without altering tool IDs", () => {
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_12345",
            content: "Log start...\n" + "Z".repeat(10000) + "\nLog end with SUCCESS",
          },
        ],
      },
      { role: "assistant", content: "Got the log." },
    ];

    const pruned = pruneMessagesContext(messages, { preserveRecentCount: 1 });

    const toolResult = pruned[0].content[0];
    expect(toolResult.type).toBe("tool_result");
    expect(toolResult.tool_use_id).toBe("toolu_12345");
    expect(toolResult.content).toContain("Log start...");
    expect(toolResult.content).toContain("Log end with SUCCESS");
    expect(toolResult.content.length).toBeLessThan(10000);
  });
});
