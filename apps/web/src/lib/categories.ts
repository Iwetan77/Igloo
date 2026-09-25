import categories from "../../../../content/categories.json";

export type Category = (typeof categories)[number];

export function categoryFor(value?: string | null): Category {
  const normalized = value?.trim().toLowerCase();
  return categories.find((item) => item.id === normalized || item.label.toLowerCase() === normalized)
    || categories.find((item) => item.id === "other")!;
}

export { categories };
