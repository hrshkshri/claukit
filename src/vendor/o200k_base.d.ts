/**
 * Type shim for the o200k_base GPT tokenizer.
 * The actual implementation is the raw JS file at src/vendor/o200k_base.js
 * which is bundled separately by esbuild and loaded as a content script
 * before our code runs.  We declare its global shape here so TypeScript
 * knows what to expect.
 */
declare const GPTTokenizer_o200k_base: {
  countTokens(text: string): number;
} | undefined;
