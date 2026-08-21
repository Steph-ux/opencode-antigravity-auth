/**
 * Smart Context Pruner
 * 
 * Automatically compacts and trims massive historical tool outputs
 * in long-running multi-turn conversations while strictly preserving:
 * 1. Tool call / result ID pairing integrity (preventing 400 Bad Request)
 * 2. Thinking signatures and reason blocks
 * 3. Recent turns (kept 100% intact for immediate context)
 * 4. First & last lines of trimmed outputs for operational awareness
 */

export interface SmartPrunerOptions {
  /** Keep the last N messages 100% untruncated (default: 6) */
  preserveRecentCount?: number;
  /** Maximum length of older historical tool result strings before pruning (default: 1500 chars) */
  maxHistoricalResultChars?: number;
  /** Number of prefix characters to retain (default: 300) */
  prefixRetentionChars?: number;
  /** Number of suffix characters to retain (default: 300) */
  suffixRetentionChars?: number;
  /** Whether pruning is enabled (default: true) */
  enabled?: boolean;
}

export const DEFAULT_PRUNER_OPTIONS: Required<SmartPrunerOptions> = {
  preserveRecentCount: 6,
  maxHistoricalResultChars: 1500,
  prefixRetentionChars: 300,
  suffixRetentionChars: 300,
  enabled: true,
};

/**
 * Truncates a large string in the middle while keeping prefix and suffix.
 */
export function pruneLargeString(
  text: string,
  maxChars = DEFAULT_PRUNER_OPTIONS.maxHistoricalResultChars,
  prefixChars = DEFAULT_PRUNER_OPTIONS.prefixRetentionChars,
  suffixChars = DEFAULT_PRUNER_OPTIONS.suffixRetentionChars,
): string {
  if (!text || typeof text !== "string" || text.length <= maxChars) {
    return text;
  }

  const omittedCount = text.length - (prefixChars + suffixChars);
  if (omittedCount <= 0) {
    return text;
  }

  const prefix = text.slice(0, prefixChars);
  const suffix = text.slice(text.length - suffixChars);

  return `${prefix}\n\n[... ${omittedCount.toLocaleString()} chars of historical output pruned for context optimization ...]\n\n${suffix}`;
}

/**
 * Recursively prunes large strings inside tool results or message parts.
 */
function prunePartContent(part: any, maxChars: number, prefix: number, suffix: number): any {
  if (!part || typeof part !== "object") {
    if (typeof part === "string") {
      return pruneLargeString(part, maxChars, prefix, suffix);
    }
    return part;
  }

  // Claude format: tool_result content
  if (part.type === "tool_result" && typeof part.content === "string") {
    return {
      ...part,
      content: pruneLargeString(part.content, maxChars, prefix, suffix),
    };
  }

  // Claude format: tool_result array of text blocks
  if (part.type === "tool_result" && Array.isArray(part.content)) {
    return {
      ...part,
      content: part.content.map((c: any) => {
        if (c?.type === "text" && typeof c.text === "string") {
          return { ...c, text: pruneLargeString(c.text, maxChars, prefix, suffix) };
        }
        return c;
      }),
    };
  }

  // Gemini format: functionResponse.response.output
  if (part.functionResponse?.response) {
    const resp = part.functionResponse.response;
    if (typeof resp === "string") {
      return {
        ...part,
        functionResponse: {
          ...part.functionResponse,
          response: pruneLargeString(resp, maxChars, prefix, suffix),
        },
      };
    }
    if (resp && typeof resp === "object" && typeof resp.output === "string") {
      return {
        ...part,
        functionResponse: {
          ...part.functionResponse,
          response: {
            ...resp,
            output: pruneLargeString(resp.output, maxChars, prefix, suffix),
          },
        },
      };
    }
  }

  // Generic text part (only prune if it looks like a large log/file dump)
  if (part.text && typeof part.text === "string" && part.text.length > maxChars * 2) {
    return {
      ...part,
      text: pruneLargeString(part.text, maxChars, prefix, suffix),
    };
  }

  return part;
}

/**
 * Prunes messages in place or returns pruned clone.
 */
export function pruneMessagesContext<T extends any[]>(
  messages: T,
  options: SmartPrunerOptions = {},
): T {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  const opts = { ...DEFAULT_PRUNER_OPTIONS, ...options };
  if (!opts.enabled) {
    return messages;
  }

  const preserveThreshold = Math.max(0, messages.length - opts.preserveRecentCount);

  return messages.map((msg, index) => {
    // Recent turns are preserved 100% without modification
    if (index >= preserveThreshold) {
      return msg;
    }

    if (!msg || typeof msg !== "object") {
      return msg;
    }

    const cloned = { ...msg };

    // Claude / Anthropic messages
    if (Array.isArray(cloned.content)) {
      cloned.content = cloned.content.map((part: any) =>
        prunePartContent(part, opts.maxHistoricalResultChars, opts.prefixRetentionChars, opts.suffixRetentionChars)
      );
    } else if (typeof cloned.content === "string" && cloned.content.length > opts.maxHistoricalResultChars * 2) {
      cloned.content = pruneLargeString(
        cloned.content,
        opts.maxHistoricalResultChars,
        opts.prefixRetentionChars,
        opts.suffixRetentionChars,
      );
    }

    // Gemini messages (parts array)
    if (Array.isArray(cloned.parts)) {
      cloned.parts = cloned.parts.map((part: any) =>
        prunePartContent(part, opts.maxHistoricalResultChars, opts.prefixRetentionChars, opts.suffixRetentionChars)
      );
    }

    return cloned;
  }) as T;
}
