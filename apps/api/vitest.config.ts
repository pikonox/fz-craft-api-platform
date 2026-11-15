import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    env: {
      // Tests only exercise pure logic; these satisfy env validation.
      SESSION_SECRET: "test-session-secret-123456",
      ENCRYPTION_KEY: "0".repeat(64),
      NODE_ENV: "test",
    },
  },
});
