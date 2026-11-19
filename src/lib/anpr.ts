import type { ZoneType } from "./sim/speed-rules";

export interface CameraScenario {
  frame: 1 | 2;
  camera: string;
  location: string;
  zoneType: ZoneType;
  plate: string;
  category: string;
  confidence: number;
  speedRange: [number, number];
  vehicleBox: [number, number, number, number];
  plateBox: [number, number, number, number];
  others: { label: string; box: [number, number, number, number] }[];
}

export const CAMERAS: CameraScenario[] = [
  {
    frame: 1,
    camera: "CAM-07 · Avinashi Rd",
    location: "Avinashi Road, near Nava India",
    zoneType: "urban",
    plate: "TN 38 DX 7426",
    category: "Car",
    confidence: 0.97,
    speedRange: [63, 77],
    vehicleBox: [42.8, 43.4, 18.4, 29.8],
    plateBox: [47.6, 66.2, 5.3, 2.9],
    others: [
      { label: "SUV · 41 km/h", box: [4.1, 36.7, 22.2, 27.1] },
      { label: "CAR · 44 km/h", box: [50.5, 25.2, 8, 12.2] },
      { label: "AUTO · 32 km/h", box: [70.2, 22.3, 4.6, 10.8] },
    ],
  },
  {
    frame: 2,
    camera: "CAM-12 · Airport Expy",
    location: "Airport Expressway, near Airport Jn",
    zoneType: "highway",
    plate: "MH 12 UJ 7368",
    category: "SUV",
    confidence: 0.95,
    speedRange: [99, 121],
    vehicleBox: [42.3, 39.1, 14.9, 28.1],
    plateBox: [46.7, 61, 4.5, 2.2],
    others: [{ label: "TRUCK · 63 km/h", box: [61.5, 4.8, 7, 15.4] }],
  },
];
