import type { Measurer } from "./env";
import type { Palette } from "./palettes";
import type { Pairing } from "./pairings";
import type { Align, BlockSpec, PlacedBlock } from "./stack";
import type { TemplateConfig } from "./template";
import type { Ctx, Rect, RenderEnv } from "./types";

export interface LayoutContext {
  W: number;
  H: number;
  /** Typographic reference length: min(W, 1.1 H). All sizes derive from it. */
  ref: number;
  safe: Rect;
  /** Safe area minus the signature reserve. Text must stay inside it. */
  box: Rect;
  palette: Palette;
  pairing: Pairing;
  template: TemplateConfig;
  env: RenderEnv;
  m: Measurer;
  isPhoto: boolean;
  /** Text colours appropriate for the drawn background. */
  ink: string;
  muted: string;
  accent: string;
}

export interface StackSpec {
  specs: BlockSpec[];
  box: Rect;
  valign: "top" | "center" | "bottom" | "optical";
  hAlign?: Align;
  /** Extra space to keep above/below the fitted stack (for rules, marks). */
  padTop?: number;
  padBottom?: number;
}

export interface Composition {
  stacks: StackSpec[];
  /** Paints panels/cards after the background and before contrast checks. */
  prepaint?(ctx: Ctx, placed: PlacedBlock[][]): void;
  /** Draws rules and marks once text is placed; returns their bounds for QA. */
  decorate?(ctx: Ctx, placed: PlacedBlock[][]): Rect[];
}
