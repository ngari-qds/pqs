/** All template configs from /templates (one JSON file per format). */
import type { FormatId, TemplateConfig } from "@/lib/render/template";
import t_carousel from "@/templates/carousel.json";
import t_classic from "@/templates/classic.json";
import t_contrast from "@/templates/contrast.json";
import t_definition from "@/templates/definition.json";
import t_dialogue from "@/templates/dialogue.json";
import t_equation from "@/templates/equation.json";
import t_field_note from "@/templates/field-note.json";
import t_hbp from "@/templates/hbp.json";
import t_gallery from "@/templates/gallery.json";
import t_highlight from "@/templates/highlight.json";
import t_law from "@/templates/law.json";
import t_list from "@/templates/list.json";
import t_myth_truth from "@/templates/myth-truth.json";
import t_one_liner from "@/templates/one-liner.json";
import t_paradox from "@/templates/paradox.json";
import t_post_card from "@/templates/post-card.json";
import t_pull_quote from "@/templates/pull-quote.json";
import t_qa from "@/templates/qa.json";
import t_stanza from "@/templates/stanza.json";
import t_stat from "@/templates/stat.json";
import t_then_now from "@/templates/then-now.json";

export const ALL_TEMPLATES = [...t_carousel, ...t_classic, ...t_contrast, ...t_definition, ...t_dialogue, ...t_equation, ...t_field_note, ...t_hbp, ...t_highlight, ...t_law, ...t_list, ...t_myth_truth, ...t_one_liner, ...t_paradox, ...t_post_card, ...t_pull_quote, ...t_qa, ...t_stanza, ...t_stat, ...t_then_now] as TemplateConfig[];

/** Generated gallery (scripts/generate-templates.ts). */
export const GALLERY_TEMPLATES = t_gallery as TemplateConfig[];

/** Hand-tuned hero templates for a format. */
export const templatesFor = (format: FormatId) => ALL_TEMPLATES.filter((t) => t.format === format);

/** Classic hero templates (kept for older call sites). */
export const HERO_TEMPLATES = templatesFor("classic");
