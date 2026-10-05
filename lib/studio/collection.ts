"use client";
/** The bundled quote collection (public/quotes), loaded on demand. */

export interface CollectionFile {
  id: string;
  name: string;
  file: string;
  count: number;
}
export interface CollectionIndex {
  total: number;
  files: CollectionFile[];
}

let indexP: Promise<CollectionIndex> | null = null;
export function collectionIndex(): Promise<CollectionIndex> {
  indexP ??= fetch("/quotes/index.json").then((r) => r.json());
  return indexP;
}

/** Text of the chosen files ("all" = every file), joined for the batch parser. */
export async function loadCollection(id: string): Promise<string> {
  const idx = await collectionIndex();
  const chosen = id === "all" ? idx.files : idx.files.filter((f) => f.id === id);
  const texts = await Promise.all(chosen.map((f) => fetch(`/quotes/${f.file}`).then((r) => r.text())));
  // A "---" between files ends any open @format+ section.
  return texts.join("\n\n---\n\n");
}
