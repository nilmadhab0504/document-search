export type DependencyState = "up" | "down";

export function aggregateHealth(dependencies: Record<string, DependencyState>) {
  const healthy = Object.values(dependencies).every((state) => state === "up");

  return {
    status: healthy ? ("ok" as const) : ("degraded" as const),
    dependencies,
  };
}
