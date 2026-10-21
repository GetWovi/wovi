import type { SVGProps } from "react";

/* Bold icons on a 24 grid, 2.5 stroke, round caps. No hairlines. */
const PATHS = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  close: "M6 6l12 12M18 6L6 18",
  "chevron-down": "M6 9.5l6 6 6-6",
  "chevron-right": "M9.5 6l6 6-6 6",
  "arrow-right": "M4 12h15M13 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  search: "M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4.5-4.5",
  spark: "M12 3l2.1 5.9L20 11l-5.9 2.1L12 19l-2.1-5.9L4 11l5.9-2.1z",
  info: "M12 11v6M12 7.5v.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  warning: "M12 9v5M12 17.5v.5M10.3 4.2L2.8 17.6A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-2.9L13.7 4.2a2 2 0 0 0-3.4 0z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  bolt: "M13 2.5L5 13.5h6l-1 8 8-11h-6l1-8z",
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 15.5v-7l3 4 3-4v7",
  copy: "M9 9h10v11H9zM5 15V4h11",
  play: "M8 5.5v13l10-6.5z",
  pause: "M8 5v14M16 5v14",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
  upload: "M12 16V4M6.5 9.5L12 4l5.5 5.5M4 20h16",
  film: "M4 5h16v14H4zM4 10h16M4 14h16M8 5v14M16 5v14",
  hash: "M9 4l-2 16M17 4l-2 16M4 9h17M3 15h17",
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  size?: number;
  label?: string;
};

export function Icon({ name, size = 24, label, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
