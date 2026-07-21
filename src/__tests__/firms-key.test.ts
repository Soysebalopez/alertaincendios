import { describe, it, expect } from "vitest";
import { isFirmsCsvBody } from "@/lib/firms-key";

// Real header returned by the FIRMS area CSV API.
const CSV_HEADER =
  "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight";

describe("isFirmsCsvBody", () => {
  it("accepts a real CSV body with data rows", () => {
    const body = `${CSV_HEADER}\n-38.95,-68.05,330.1,0.39,0.36,2026-07-21,0512,N,VIIRS,n,2.0NRT,290.1,5.2,N`;
    expect(isFirmsCsvBody(body)).toBe(true);
  });
  it("accepts a header-only CSV (zero fires is legitimate)", () => {
    expect(isFirmsCsvBody(`${CSV_HEADER}\n`)).toBe(true);
  });
  it("rejects the invalid-key body NASA sends with HTTP 200", () => {
    expect(isFirmsCsvBody("Invalid MAP_KEY.")).toBe(false);
  });
  it("rejects the rate-limit body", () => {
    expect(
      isFirmsCsvBody(
        "MAP_KEY is invalid or your have exceeded your transaction/time limit. Please try again later."
      )
    ).toBe(false);
  });
  it("rejects an HTML error page", () => {
    expect(isFirmsCsvBody("<!DOCTYPE html><html><body>Maintenance</body></html>")).toBe(false);
  });
  it("rejects empty / null / undefined bodies", () => {
    expect(isFirmsCsvBody("")).toBe(false);
    expect(isFirmsCsvBody(null)).toBe(false);
    expect(isFirmsCsvBody(undefined)).toBe(false);
  });
  it("tolerates leading whitespace before the header", () => {
    expect(isFirmsCsvBody(`\n${CSV_HEADER}\n`)).toBe(true);
  });
});
