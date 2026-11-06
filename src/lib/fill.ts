/**
 * Fills `{name}` placeholders in a message passed from a Server Component to a Client Component
 * (functions cannot cross that boundary, so templates travel as strings: `t.raw(key)`).
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
