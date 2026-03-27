import { describe, it, expect } from "vitest";
import { formatRuntime, formatCurrency, formatLanguage, formatEpisodeCode } from "./format";

describe("formatRuntime", () => {
  it("formats hours and minutes", () => {
    expect(formatRuntime(148)).toBe("2h 28m");
  });

  it("formats exactly one hour", () => {
    expect(formatRuntime(60)).toBe("1h 0m");
  });

  it("formats minutes only when under an hour", () => {
    expect(formatRuntime(45)).toBe("45m");
  });

  it("formats zero minutes", () => {
    expect(formatRuntime(0)).toBe("0m");
  });
});

describe("formatCurrency", () => {
  it("formats large budgets", () => {
    expect(formatCurrency(150000000)).toBe("$150,000,000");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0");
  });
});

describe("formatLanguage", () => {
  it("maps en to English", () => {
    expect(formatLanguage("en")).toBe("English");
  });

  it("maps ja to Japanese", () => {
    expect(formatLanguage("ja")).toBe("Japanese");
  });

  it("maps fr to French", () => {
    expect(formatLanguage("fr")).toBe("French");
  });

  it("maps ko to Korean", () => {
    expect(formatLanguage("ko")).toBe("Korean");
  });

  it("maps zh to Chinese", () => {
    expect(formatLanguage("zh")).toBe("Chinese");
  });

  it("is case-insensitive", () => {
    expect(formatLanguage("EN")).toBe("English");
    expect(formatLanguage("En")).toBe("English");
  });

  it("returns uppercased code for unknown languages", () => {
    expect(formatLanguage("xx")).toBe("XX");
  });
});

describe("formatEpisodeCode", () => {
  it("zero-pads single-digit season and episode", () => {
    expect(formatEpisodeCode(1, 3)).toBe("S01E03");
  });

  it("zero-pads single-digit season with double-digit episode", () => {
    expect(formatEpisodeCode(2, 10)).toBe("S02E10");
  });

  it("handles double-digit season and episode", () => {
    expect(formatEpisodeCode(12, 24)).toBe("S12E24");
  });

  it("handles triple-digit episode numbers", () => {
    expect(formatEpisodeCode(1, 100)).toBe("S01E100");
  });
});
