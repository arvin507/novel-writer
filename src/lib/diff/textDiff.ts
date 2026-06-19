import { diffWords } from "diff";

export function buildWordDiff(oldText: string, newText: string) {
  return diffWords(oldText, newText).map((part, index) => ({
    id: index,
    value: part.value,
    added: Boolean(part.added),
    removed: Boolean(part.removed),
  }));
}
