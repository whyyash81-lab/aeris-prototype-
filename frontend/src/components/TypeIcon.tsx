import { Flame, Waves, Wind, type LucideIcon } from "lucide-react";
import type { HazardType } from "@/lib/types";
import { HAZARD_META } from "@/lib/risk";

const ICONS: Record<HazardType, LucideIcon> = {
  flood: Waves,
  fire: Flame,
  pollution: Wind,
};

export function hazardIcon(type: HazardType): LucideIcon {
  return ICONS[type];
}

export function TypeIcon({
  type,
  className,
}: {
  type: HazardType;
  className?: string;
}) {
  const Icon = ICONS[type];
  const color = HAZARD_META[type].color;
  return (
    <span
      data-slot="type-icon"
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md ring-1 ring-inset"
      style={{
        color,
        backgroundColor: `${color}1a`,
        borderColor: `${color}55`,
      }}
    >
      <Icon className={className ?? "size-3.5"} />
    </span>
  );
}

export { ICONS };