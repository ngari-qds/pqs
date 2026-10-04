import type { FaceRef } from "./types";

/**
 * Fourteen type pairings. Each defines faces per role; the template system
 * never mixes more than the two families of one pairing.
 */
export interface Pairing {
  id: string;
  name: string;
  display: FaceRef;
  displayEm: FaceRef;
  text: FaceRef;
  textEm: FaceRef;
  label: FaceRef;
  /** Uses a monospace family; restricted to equation, field note and post formats. */
  mono: boolean;
  /** Display family is set in capitals (Bebas Neue). */
  uppercaseDisplay?: boolean;
  /** Optical adjustments for this display face. */
  displayTracking?: number;
  lineHeightFactor?: number;
  /** A serif with high stroke contrast that needs a calm backdrop. */
  delicate?: boolean;
}

const F = (family: string, weight = 400, style: "normal" | "italic" = "normal"): FaceRef => ({ family, weight, style });

export const PAIRINGS: Pairing[] = [
  { id: "fraunces-inter", name: "Fraunces + Inter", display: F("Fraunces"), displayEm: F("Fraunces", 400, "italic"), text: F("Inter"), textEm: F("Inter", 600), label: F("Inter", 500), mono: false },
  { id: "instrument-inter", name: "Instrument Serif + Inter", display: F("Instrument Serif"), displayEm: F("Instrument Serif", 400, "italic"), text: F("Inter"), textEm: F("Inter", 600), label: F("Inter", 500), mono: false, displayTracking: 0.014, lineHeightFactor: 0.98, delicate: true },
  { id: "cormorant-work", name: "Cormorant Garamond + Work Sans", display: F("Cormorant Garamond", 500), displayEm: F("Cormorant Garamond", 500, "italic"), text: F("Work Sans"), textEm: F("Work Sans", 500), label: F("Work Sans", 500), mono: false, delicate: true },
  { id: "garamond-plex", name: "EB Garamond + IBM Plex Sans", display: F("EB Garamond"), displayEm: F("EB Garamond", 400, "italic"), text: F("IBM Plex Sans"), textEm: F("IBM Plex Sans", 500), label: F("IBM Plex Sans", 500), mono: false, delicate: true },
  { id: "newsreader-intertight", name: "Newsreader + Inter Tight", display: F("Newsreader"), displayEm: F("Newsreader", 400, "italic"), text: F("Inter Tight"), textEm: F("Inter Tight", 600), label: F("Inter Tight", 500), mono: false },
  { id: "playfair-source", name: "Playfair Display + Source Sans 3", display: F("Playfair Display"), displayEm: F("Playfair Display", 400, "italic"), text: F("Source Sans 3"), textEm: F("Source Sans 3", 600), label: F("Source Sans 3", 600), mono: false, delicate: true },
  { id: "dmserif-dmsans", name: "DM Serif Display + DM Sans", display: F("DM Serif Display"), displayEm: F("DM Serif Display", 400, "italic"), text: F("DM Sans"), textEm: F("DM Sans", 500), label: F("DM Sans", 500), mono: false },
  { id: "caslon-karla", name: "Libre Caslon Text + Karla", display: F("Libre Caslon Text"), displayEm: F("Libre Caslon Text", 400, "italic"), text: F("Karla"), textEm: F("Karla", 500), label: F("Karla", 500), mono: false },
  { id: "spectral-manrope", name: "Spectral + Manrope", display: F("Spectral"), displayEm: F("Spectral", 400, "italic"), text: F("Manrope"), textEm: F("Manrope", 500), label: F("Manrope", 500), mono: false },
  { id: "grotesk-mono", name: "Space Grotesk + Space Mono", display: F("Space Grotesk", 500), displayEm: F("Space Grotesk", 700), text: F("Space Grotesk"), textEm: F("Space Grotesk", 700), label: F("Space Mono"), mono: true, displayTracking: -0.01 },
  { id: "plex-serif-mono", name: "IBM Plex Serif + IBM Plex Mono", display: F("IBM Plex Serif"), displayEm: F("IBM Plex Serif", 400, "italic"), text: F("IBM Plex Mono"), textEm: F("IBM Plex Mono", 500), label: F("IBM Plex Mono"), mono: true },
  { id: "jetbrains", name: "JetBrains Mono", display: F("JetBrains Mono", 600), displayEm: F("JetBrains Mono", 400), text: F("JetBrains Mono"), textEm: F("JetBrains Mono", 600), label: F("JetBrains Mono"), mono: true, displayTracking: -0.01 },
  { id: "bebas-inter", name: "Bebas Neue + Inter", display: F("Bebas Neue"), displayEm: F("Bebas Neue"), text: F("Inter"), textEm: F("Inter", 600), label: F("Inter", 500), mono: false, uppercaseDisplay: true, displayTracking: 0.03, lineHeightFactor: 0.92 },
  { id: "syne-inter", name: "Syne + Inter", display: F("Syne", 700), displayEm: F("Syne", 500), text: F("Inter"), textEm: F("Inter", 600), label: F("Inter", 500), mono: false, displayTracking: -0.01 },
];

export const getPairing = (id: string) => PAIRINGS.find((x) => x.id === id) ?? PAIRINGS[0];

/** Every face a pairing can draw with — used to preload fonts before rendering. */
export function pairingFaces(p: Pairing): FaceRef[] {
  return [p.display, p.displayEm, p.text, p.textEm, p.label];
}
