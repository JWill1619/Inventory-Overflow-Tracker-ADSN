import { afterEach, expect, it, vi } from "vitest";
import { config } from "../lib/db";
afterEach(() => vi.unstubAllEnvs());
function production() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", "postgresql://example:example@localhost/postgres");
  vi.stubEnv("APP_ORIGIN", "https://example.test");
  vi.stubEnv("DATABASE_SSL", "require");
  vi.stubEnv("PRIVATE_ACCESS_CONFIRMED", "false");
  vi.stubEnv("ACCESS_MODE", "private");
}
it("retains the private-access gate unless public login is explicitly selected", () => {
  production();
  expect(() => config()).toThrow();
  vi.stubEnv("PRIVATE_ACCESS_CONFIRMED", "true");
  expect(config().ACCESS_MODE).toBe("private");
});
it("accepts approved public login only with HTTPS and verified database TLS", () => {
  production();
  vi.stubEnv("ACCESS_MODE", "public-login");
  expect(config().ACCESS_MODE).toBe("public-login");
  vi.stubEnv("APP_ORIGIN", "http://example.test");
  expect(() => config()).toThrow();
  vi.stubEnv("APP_ORIGIN", "https://example.test");
  vi.stubEnv("DATABASE_SSL", "disable");
  expect(() => config()).toThrow();
});
