import { describe, expect, it } from "vitest";
import {
  distanceMeters,
  isWithinGeofence,
  parseCoordinates,
} from "../src/lib/geo";

const JAKARTA_HQ = { latitude: -6.2088, longitude: 106.8456 };

describe("geo", () => {
  it("menghitung jarak dua titik dengan Haversine", () => {
    const distance = distanceMeters(JAKARTA_HQ, JAKARTA_HQ);
    expect(distance).toBe(0);

    // Monas -> Jakarta HQ kurang lebih 1-2 km.
    const monas = { latitude: -6.1754, longitude: 106.8272 };
    const result = distanceMeters(JAKARTA_HQ, monas);
    expect(result).toBeGreaterThan(3_000);
    expect(result).toBeLessThan(5_000);
  });

  it("menganggap titik di dalam radius sebagai valid", () => {
    expect(
      isWithinGeofence(
        { latitude: -6.2089, longitude: 106.8457 },
        JAKARTA_HQ,
        250,
      ),
    ).toBe(true);
  });

  it("menolak titik di luar radius", () => {
    expect(
      isWithinGeofence({ latitude: -6.3, longitude: 106.9 }, JAKARTA_HQ, 250),
    ).toBe(false);
  });

  it("radius negatif diperlakukan sebagai 0 meter", () => {
    expect(isWithinGeofence(JAKARTA_HQ, JAKARTA_HQ, -100)).toBe(true);
    expect(
      isWithinGeofence({ latitude: -6.21, longitude: 106.8456 }, JAKARTA_HQ, -1),
    ).toBe(false);
  });

  it("memvalidasi koordinat masukan", () => {
    expect(parseCoordinates("-6.2", "106.8")).toEqual({
      latitude: -6.2,
      longitude: 106.8,
    });
    expect(parseCoordinates(-90, 180)).toEqual({ latitude: -90, longitude: 180 });
    expect(parseCoordinates(91, 106)).toBeNull();
    expect(parseCoordinates(-91, 106)).toBeNull();
    expect(parseCoordinates(-6, 181)).toBeNull();
    expect(parseCoordinates(-6, -181)).toBeNull();
    expect(parseCoordinates("abc", 106)).toBeNull();
    expect(parseCoordinates(undefined, undefined)).toBeNull();
  });
});
