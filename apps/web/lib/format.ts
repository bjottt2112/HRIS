export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

export function departmentColor(department: string): string {
  switch (department) {
    case "Product":
      return "bg-purple-500";
    case "Engineering":
      return "bg-blue-500";
    case "Marketing":
      return "bg-red-500";
    case "Finance":
      return "bg-amber-500";
    case "People":
      return "bg-sky-500";
    default:
      return "bg-emerald-500";
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export function maskSensitive(
  value: string | null | undefined,
  unmasked: boolean,
  visibleCount = 4,
): string {
  if (!value) return "••••••••••••";
  if (unmasked) return value;

  const clean = value.replace(/[^a-zA-Z0-9]/g, "");
  if (clean.length <= visibleCount) return "••••••••••••";

  return clean.substring(0, visibleCount) + "•".repeat(clean.length - visibleCount);
}

export function todayLabel(): string {
  return new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
