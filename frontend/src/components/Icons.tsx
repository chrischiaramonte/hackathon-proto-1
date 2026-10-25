// Small inline icon set (stroke icons on a 24px grid), decorative unless labelled.
import type { SVGProps } from 'react';

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const IconBolt = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M13.2 2.5L5 13.6h5.6l-1 7.9 8.4-11.3h-5.7l.9-7.7z" />
  </Icon>
);

export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M8 5.5v13l10.5-6.5L8 5.5z" />
  </Icon>
);

export const IconPause = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M9 6v12M15 6v12" />
  </Icon>
);

export const IconTurtle = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 15h13a4 4 0 0 0-4-6H9a5 5 0 0 0-5 6zM17 13h2.5a1.5 1.5 0 0 0 0-3H18M6 15l-1 3M15 15l1 3" />
  </Icon>
);

export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.2a3 3 0 0 1 0 5.6M18 14.2A5.5 5.5 0 0 1 20.5 19" />
  </Icon>
);

export const IconCamera = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="6.5" width="13" height="11" rx="2.5" />
    <path d="M16 10.5l5-3v9l-5-3" />
  </Icon>
);

export const IconRefresh = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 0 0-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16M20 20v-4h-4" />
  </Icon>
);

export const IconArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const IconStar = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M12 2.8l2.8 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.1l-5.7 3 1.2-6.3L2.9 9.4l6.3-.8L12 2.8z" />
  </Icon>
);

export const IconHand = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V13M8 11.5V9a1.5 1.5 0 0 0-3 0v5.5a7 7 0 0 0 7 6.5h.5A5.5 5.5 0 0 0 18 15.5V12" />
  </Icon>
);

export const IconSun = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Icon>
);

export const IconMoon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Icon>
);
