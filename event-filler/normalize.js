export function missingFields(row) {
  return Object.entries(row)
    .filter(([, value]) => (value === null) || (value === undefined) || (typeof value === "string" && value.trim() === ""))
    .map(([field]) => field);
}
