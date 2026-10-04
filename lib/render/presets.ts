export interface SizePreset {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Default export multiplier. */
  scale: 1 | 2 | 3;
}

export const PRESETS: SizePreset[] = [
  { id: "ig-portrait", name: "Instagram portrait", width: 1080, height: 1350, scale: 2 },
  { id: "status", name: "WhatsApp status / Stories", width: 1080, height: 1920, scale: 2 },
  { id: "square", name: "Square", width: 1080, height: 1080, scale: 2 },
  { id: "x", name: "X / Twitter", width: 1200, height: 675, scale: 2 },
  { id: "linkedin", name: "LinkedIn", width: 1200, height: 628, scale: 2 },
  { id: "print", name: "Print-ish 4:5", width: 2160, height: 2700, scale: 1 },
];

export const getPreset = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];
