/** Line icons (24×24, stroked with `currentColor`), built as SVG nodes without parsing markup. */

const SVG_NS = 'http://www.w3.org/2000/svg';

type Shape = readonly [tag: 'path' | 'rect' | 'circle', attributes: Readonly<Record<string, string>>];

const path = (d: string): Shape => ['path', { d }];
const rect = (x: number, y: number, width: number, height: number, rx: number): Shape => [
  'rect',
  { x: String(x), y: String(y), width: String(width), height: String(height), rx: String(rx) },
];

const ICONS = {
  close: [path('M18 6 6 18M6 6l12 12')],
  left: [path('m15 18-6-6 6-6')],
  right: [path('m9 18 6-6-6-6')],
  single: [rect(6.5, 3, 11, 18, 1.8)],
  double: [rect(2.5, 4, 9, 16, 1.6), rect(12.5, 4, 9, 16, 1.6)],
  sun: [
    ['circle', { cx: '12', cy: '12', r: '4' }],
    path(
      'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    ),
  ],
  moon: [path('M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.6 6.6 0 0 0 10.7 10.7z')],
  expand: [
    path('M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3'),
  ],
  shrink: [
    path('M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3'),
  ],
  help: [
    ['circle', { cx: '12', cy: '12', r: '9.5' }],
    path('M9.2 9.2a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.6-2.8 2.6M12 17h.01'),
  ],
  flip: [
    path('M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z'),
    path('M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z'),
  ],
  slide: [path('m5 9-3 3 3 3M19 9l3 3-3 3M2 12h20')],
  instant: [path('M13 2 3 14h9l-1 8 10-12h-9z')],
  offset: [rect(2, 6, 5, 12, 1), rect(10, 4, 5.5, 16, 1), rect(16.5, 4, 5.5, 16, 1)],
  rtl: [path('M19 12H5M11 18l-6-6 6-6')],
  ltr: [path('M5 12h14M13 6l6 6-6 6')],
  list: [path('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01')],
} satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;

/** A fresh, decorative (`aria-hidden`) SVG icon. */
export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attributes: Record<string, string> = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
  for (const [tag, shapeAttributes] of ICONS[name]) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(shapeAttributes)) shape.setAttribute(key, value);
    svg.append(shape);
  }
  return svg;
}
