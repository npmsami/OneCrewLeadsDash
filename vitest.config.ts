import { defineConfig } from "vitest/config";

// Unit tests for the pure dashboard libs (filters, outreach, resumes).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
