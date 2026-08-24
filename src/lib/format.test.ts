// (#397) Frontend test harness baseline: vitest + format utility tests; expand to component/integration tests.
import { describe, expect, it } from "vitest";
import { bytes, truncatePath } from "./format";

describe("bytes", () => {
  it("formats bytes below 1 KiB without decimals", () => {
    expect(bytes(0)).toBe("0 B");
    expect(bytes(512)).toBe("512 B");
    expect(bytes(1023)).toBe("1023 B");
  });

  it("formats KiB with one decimal", () => {
    expect(bytes(1024)).toBe("1.0 KB");
    expect(bytes(1536)).toBe("1.5 KB");
  });

  it("formats MiB and GiB", () => {
    expect(bytes(1024 * 1024)).toBe("1.0 MB");
    expect(bytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
    expect(bytes(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
  });
});

describe("truncatePath", () => {
  it("returns short paths unchanged", () => {
    expect(truncatePath("src/app.ts")).toBe("src/app.ts");
    expect(truncatePath("a/very/long/path/that/exceeds/limit.ts", 20)).toBe(
      "…/exceeds/limit.ts"
    );
  });

  it("keeps the filename and drops leading segments first", () => {
    const out = truncatePath("src/components/deep/nested/MemoryDetail.tsx", 30);
    expect(out.startsWith("…/")).toBe(true);
    expect(out.endsWith("MemoryDetail.tsx")).toBe(true);
  });

  it("truncates very long filenames while keeping the extension", () => {
    const out = truncatePath("src/generated/VeryLongGeneratedTestFixtureNameThatOverflows.ts", 40);
    expect(out.endsWith(".ts")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(40);
  });
});
