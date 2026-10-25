/* Drink pictures: glass outline, gradient liquid, ice, shine and the garnish, drawn per drink. */
const ART = (() => {
  const shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
    return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, "0")).join("");
  };
  // body: glass outline; top: liquid surface y; extra: stem/foot/handle; cubes: ice positions [x, y, size]
  const G = {
    coupe: { body: "M9 20 H55 C55 37 45 46 32 46 C19 46 9 37 9 20Z", top: 25, extra: "M32 46 V68 M20 71 Q32 66 44 71", cubes: [], rim: [52, 20] },
    rocks: { body: "M13 28 H51 L49 69 Q48.6 72 46 72 H18 Q15.4 72 15 69Z", top: 40, extra: "", cubes: [[20, 44, 13], [31, 50, 12]], rim: [49, 28] },
    highball: { body: "M19 8 H45 L44 72 H20Z", top: 17, extra: "", cubes: [[23, 22, 10], [30, 36, 10], [23, 50, 10]], rim: [43, 8] },
    wine: { body: "M13 12 H51 C53 33 45 46 32 46 C19 46 11 33 13 12Z", top: 24, extra: "M32 46 V68 M20 71 Q32 66 44 71", cubes: [[19, 28, 9], [32, 30, 9]], rim: [49, 12] },
    shot: { body: "M20 36 H44 L41 72 H23Z", top: 46, extra: "M22.5 64 H41.5", cubes: [], rim: [42, 36] },
    hurricane: { body: "M19 6 C16 18 26 22 23 32 C20 42 24 53 32 53 C40 53 44 42 41 32 C38 22 48 18 45 6Z", top: 14, extra: "M32 53 V68 M21 71 Q32 66 43 71", cubes: [[25, 22, 9], [31, 34, 9]], rim: [43, 6] },
    heatproof: { body: "M17 16 H45 L43 58 H19Z", top: 20, extra: "M45 24 C55 24 55 44 44 44 M31 58 V68 M20 71 Q31 66 42 71", cubes: [], rim: [43, 16], cream: 8 },
    pitcher: { body: "M14 16 H44 L46 72 H16Z", top: 26, extra: "M14 16 L9 11 M44 24 C56 24 56 52 45 52", cubes: [[20, 32, 10], [30, 42, 10], [21, 54, 10]], rim: [42, 16] },
    shake: { body: "M17 26 H47 L42 72 H22Z", top: 26, extra: "M38 4 L33 26", cubes: [], rim: [40, 14], whip: true },
    halfpint: { body: "M17 10 H47 L43 72 H21Z", top: 16, extra: "", cubes: [], rim: [45, 10], foam: 6 },
  };
  const GARNISH = [
    [/lime/i, "wheel", "#9ccc3c"], [/lemon/i, "wheel", "#f2d54a"], [/orange|marmalade/i, "wheel", "#f39a2e"], [/cucumber/i, "wheel", "#b9dc8c"],
    [/strawberr/i, "berry", "#e0344f"], [/cherr/i, "cherry", "#c4142e"], [/raspberr|blackberr/i, "berry", "#9c1d4a"],
    [/mint|basil/i, "leaf", "#3fa34d"], [/pineapple/i, "leaf", "#5e8f2f"], [/coffee bean/i, "beans", "#4a2b17"],
    [/flower/i, "flower", "#b48ce6"], [/jalape|chilli|chili/i, "chilli", "#d93025"], [/marshmallow|cotton candy/i, "puff", "#fff4e8"],
    [/pickle|olive/i, "olive", "#7d9a3a"], [/apple/i, "wheel", "#cfe58a"], [/nutmeg|cinnamon|cocoa|powder|salt|sugar/i, "dust", "#d9c7a6"],
  ];
  const garnishSvg = (text, [x, y]) => {
    const g = GARNISH.find(([re]) => re.test(text || ""));
    if (!g) return "";
    const [, kind, c] = g;
    const dk = shade(c, -0.35);
    switch (kind) {
      case "wheel": return `<g transform="translate(${x} ${y})"><circle r="8" fill="${c}" stroke="${dk}" stroke-width="1.4"/><circle r="5.6" fill="${shade(c, 0.35)}"/><path d="M0-5.6V5.6M-5.6 0H5.6M-4 -4L4 4M4 -4L-4 4" stroke="${c}" stroke-width=".9"/></g>`;
      case "berry": return `<g transform="translate(${x} ${y - 2})"><path d="M0 7C-6 3-7-3-3-5C-1-6 1-6 3-5C7-3 6 3 0 7Z" fill="${c}"/><path d="M-3-5L0-8L3-5" stroke="#3fa34d" stroke-width="1.6" fill="none"/><circle cx="-1.5" cy="0" r=".6" fill="#fff8"/><circle cx="1.8" cy="2" r=".6" fill="#fff8"/></g>`;
      case "cherry": return `<g transform="translate(${x} ${y})"><path d="M0-1 Q2-10 7-12" stroke="#5a3a1a" stroke-width="1.3" fill="none"/><circle r="4.6" fill="${c}"/><circle cx="-1.5" cy="-1.5" r="1.2" fill="#fff9"/></g>`;
      case "leaf": return `<g transform="translate(${x} ${y})"><path d="M0 2C-8-2-8-10-2-12C0-6 1-2 0 2Z" fill="${c}"/><path d="M0 2C8-2 9-9 4-12C1-7 0-3 0 2Z" fill="${shade(c, 0.2)}"/></g>`;
      case "beans": return `<g transform="translate(${x - 4} ${y - 1})">${[0, 6, 12].map((dx) => `<ellipse cx="${dx}" cy="0" rx="2.8" ry="2" fill="${c}"/><path d="M${dx - 2} 0H${dx + 2}" stroke="#c9a96b" stroke-width=".6"/>`).join("")}</g>`;
      case "flower": return `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="2.6" ry="4.6" transform="rotate(${a}) translate(0 -3.6)" fill="${c}"/>`).join("")}<circle r="2" fill="#f6d55c"/></g>`;
      case "chilli": return `<g transform="translate(${x} ${y})"><path d="M-6 4C-2 6 5 2 7-6C3-2-1 0-6 0Z" fill="${c}"/><path d="M7-6L9-9" stroke="#3fa34d" stroke-width="1.6"/></g>`;
      case "puff": return `<g transform="translate(${x} ${y - 2})"><rect x="-5" y="-4" width="10" height="9" rx="3" fill="${c}" stroke="#d8c3a5" stroke-width=".8"/><path d="M-4 -1H4" stroke="#c9a46a" stroke-width="1.2" opacity=".7"/></g>`;
      case "olive": return `<g transform="translate(${x} ${y})"><path d="M-9 -9L6 6" stroke="#cfc6b8" stroke-width="1"/><ellipse rx="3.4" ry="4.4" transform="rotate(-45)" fill="${c}"/></g>`;
      case "dust": return `<g transform="translate(${x - 8} ${y + 1})">${[0, 3, 6, 9, 12, 15].map((dx, i) => `<circle cx="${dx}" cy="${i % 2}" r=".9" fill="${c}"/>`).join("")}</g>`;
    }
    return "";
  };
  const cache = new Map();
  return (kind, colour, garnish, iceText) => {
    const key = kind + colour + garnish;
    if (cache.has(key)) return cache.get(key);
    const s = G[kind] || G.coupe;
    const id = (kind + colour.slice(1) + (garnish || "").length).replace(/[^a-z0-9]/gi, "");
    const hi = shade(colour, 0.3), lo = shade(colour, -0.25);
    const noIce = /none|served up|slush|no ice/i.test(iceText || "");
    const crushed = /crushed/i.test(iceText || "");
    const cubes = noIce ? [] : crushed ? [[s.rim[0] - 26, s.top + 4, 5], [s.rim[0] - 18, s.top + 8, 6], [s.rim[0] - 22, s.top + 14, 5], [s.rim[0] - 12, s.top + 3, 5]] : s.cubes;
    const out = `<svg viewBox="0 0 64 80" xmlns="http://www.w3.org/2000/svg"><defs>
<linearGradient id="l${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></linearGradient>
<clipPath id="c${id}"><path d="${s.body}"/></clipPath></defs>
<path d="${s.body}" fill="currentColor" fill-opacity=".06"/>
<g clip-path="url(#c${id})"><rect x="0" y="${s.top}" width="64" height="80" fill="url(#l${id})"/>
<rect x="0" y="${s.top}" width="64" height="1.6" fill="#fff" fill-opacity=".45"/>
${s.foam ? `<rect x="0" y="${s.top}" width="64" height="${s.foam}" fill="#f6efe0"/>` : ""}${s.cream ? `<rect x="0" y="${s.top}" width="64" height="${s.cream}" fill="#f4ead6"/>` : ""}
${cubes.map(([x, y, z]) => `<rect x="${x}" y="${y}" width="${z}" height="${z}" rx="2" fill="#fff" fill-opacity=".32" stroke="#fff" stroke-opacity=".7" stroke-width=".8" transform="rotate(${(x * 7) % 20 - 10} ${x + z / 2} ${y + z / 2})"/>`).join("")}
<path d="M${s.rim[0] - 30} ${s.top - 30} L${s.rim[0] - 34} 90" stroke="#fff" stroke-opacity=".28" stroke-width="3"/></g>
${s.whip ? `<path d="M15 27 C12 20 20 14 25 17 C27 10 38 10 39 17 C45 14 52 21 49 27Z" fill="#fbf6ee" stroke="#e6dccb" stroke-width=".8"/>` : ""}
<path d="${s.body}" fill="none" stroke="currentColor" stroke-opacity=".85" stroke-width="1.7" stroke-linejoin="round"/>
${s.extra ? `<path d="${s.extra}" fill="none" stroke="currentColor" stroke-opacity=".85" stroke-width="1.7" stroke-linecap="round"/>` : ""}
${garnishSvg(garnish, s.rim)}</svg>`;
    cache.set(key, out);
    return out;
  };
})();
