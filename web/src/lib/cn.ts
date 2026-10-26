/** Joins class names, dropping falsy values (e.g. `cn("a", isActive && "b")`). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
