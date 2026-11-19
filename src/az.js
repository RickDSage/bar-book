/* ---------- A to Z: one way to scroll any long list ----------
   A list that puts azHead() over each letter (azHtml does it for you) gets a strip of letters down its right edge, like
   a phone's contacts: tap a letter or slide a finger down the strip and the list goes there, with the letter big in the
   middle while you slide. A heading with data-az="★" (Black Tap signatures on the Menu) puts ★ at the top of the strip.
   The strip finds the list on screen by itself, whichever page, the item picker or the iPad station's own scrolling
   list, so a new list only needs the headings. Searching draws a list without headings, so the strip goes away. */
function azL(s) {
  const c = String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
}
// A to Z by name, ignoring case and accents, with numbers in number order and anything not starting with a letter last.
function azCmp(a, b) {
  const x = azL(a), y = azL(b);
  if (x !== y) return x === "#" ? 1 : y === "#" ? -1 : x < y ? -1 : 1;
  return a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
}
function azSort(xs, name) { return xs.slice().sort((a, b) => azCmp(name(a), name(b))); }
function azHead(L) { return `<div class="az-h" data-az="${L}">${L}</div>`; }
// The rows A to Z with a heading over each letter. Short lists (under min) are just the rows, A to Z.
function azHtml(xs, name, row, min = 15) {
  const s = azSort(xs, name);
  if (s.length < min) return s.map(row).join("");
  let out = "", cur = null;
  for (const x of s) { const L = azL(name(x)); if (L !== cur) { cur = L; out += azHead(L); } out += row(x); }
  return out;
}

const AZ = { heads: [], keys: [], sig: "", sc: null, box: null, raf: 0, drag: false, cur: "", bubT: 0 };
document.body.insertAdjacentHTML("beforeend", `<nav class="az-rail" id="az-rail" aria-label="A to Z" hidden></nav><div class="az-bub" id="az-bub" aria-hidden="true" hidden></div>`);
// What's on top: the item picker or another box over the page, else the page itself.
function azRoot() {
  const ov = [...document.querySelectorAll("#pick, #sheet, .help, .welcome")].filter((x) => !x.hidden && x.getClientRects().length);
  return ov.length ? ov[ov.length - 1] : document.querySelector("main");
}
// The box that scrolls the list: the picker's, the iPad station's, or (null) the page.
function azScroller(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}
// The bars that stick at the top of what scrolls: the search bar, the Shift places, the top of a full-screen sheet, the
// bar station's part headings.
// The Shift tabs carry a 10 px band of page colour under them (their box-shadow), so a heading clears that too.
const AZ_STICKY = "#hdr, #placebar, .sheet-top, .sx-h, .ptabs";
const azStickies = () => [...(AZ.sc || document).querySelectorAll(AZ_STICKY)].filter((s) => s.getClientRects().length && getComputedStyle(s).position === "sticky");
// How far down they reach once they've stuck, so a letter lands just under them.
function azStick() { return Math.max(0, ...azStickies().map((s) => (parseFloat(getComputedStyle(s).top) || 0) + s.offsetHeight + (s.matches(".ptabs") ? 10 : 0))); }
// The part of the screen the list shows in: under the sticky bars, above the tab bar.
function azFrame() {
  const r = AZ.sc ? AZ.sc.getBoundingClientRect() : { top: 0, bottom: innerHeight };
  let top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
  for (const s of azStickies()) if (!AZ.box.contains(s)) top = Math.max(top, s.getBoundingClientRect().bottom + (s.matches(".ptabs") ? 10 : 0));
  const tabs = document.querySelector("nav.tabs");
  if (!AZ.sc && tabs && tabs.getClientRects().length) bottom = Math.min(bottom, tabs.getBoundingClientRect().top);
  // Not above the list itself, where the intro and search box have no room kept for the strip, unless the list starts so
  // low that the strip would be too short to slide on.
  top = Math.max(top, Math.min(AZ.box.getBoundingClientRect().top, bottom - 260));
  // Stop above the buttons that float in the bottom corner (🎤 Say it, a timer, one-hand mode), where they'd cover it.
  const right = AZ.box.getBoundingClientRect().right;
  for (const f of document.querySelectorAll("#sd-mic, #sd-timer, #sd-1h")) {
    const r = f.getClientRects().length && !f.hidden && f.getBoundingClientRect();
    if (r && r.left < right && r.right > right - 30 && r.top < bottom && r.bottom > top) bottom = Math.min(bottom, r.top - 4);
  }
  return [top, bottom];
}
function azRefresh() {
  AZ.raf = 0;
  const rail = document.getElementById("az-rail");
  const heads = [...azRoot().querySelectorAll("[data-az]")].filter((h) => h.getClientRects().length);
  const keys = [...new Set(heads.map((h) => h.dataset.az))];
  const box = heads[0] && (heads[0].closest(".az-list") || heads[0].parentElement);
  if (AZ.box && AZ.box !== box) AZ.box.classList.remove("az-room");
  if (keys.length < 4) { AZ.heads = []; AZ.box = null; rail.hidden = true; return; }
  AZ.heads = heads; AZ.keys = keys; AZ.box = box; AZ.sc = azScroller(heads[0]);
  box.classList.add("az-room");
  const sig = keys.join("");
  if (sig !== AZ.sig) { AZ.sig = sig; AZ.cur = ""; rail.innerHTML = keys.map((k) => `<button type="button" data-azk="${k}" aria-label="${k === "★" ? "Black Tap signatures" : k === "#" ? "Numbers" : k}">${k}</button>`).join(""); }
  const [top, bottom] = azFrame(), r = box.getBoundingClientRect(), h = Math.max(0, bottom - top - 12);
  rail.hidden = h < 120;
  if (rail.hidden) return;
  // Over the box it's in (the picker sits above the page), under anything that opens over that.
  const root = azRoot(), z = root.tagName === "MAIN" ? 9 : (parseInt(getComputedStyle(root).zIndex) || 20) + 1;
  rail.style.zIndex = z; document.getElementById("az-bub").style.zIndex = z + 1;
  rail.style.top = `${top + 6}px`; rail.style.height = `${h}px`;
  rail.style.left = `${Math.min(r.right, innerWidth) - rail.offsetWidth}px`;
  rail.style.fontSize = `${Math.max(9, Math.min(13, (h / keys.length) * 0.75))}px`;
  // The letter you're in lights up.
  const line = (AZ.sc ? AZ.sc.getBoundingClientRect().top : 0) + azStick() + 8;
  let cur = keys[0];
  for (const x of heads) { if (x.getBoundingClientRect().top <= line) cur = x.dataset.az; else break; }
  if (cur !== AZ.cur) { AZ.cur = cur; rail.querySelectorAll("button").forEach((b) => b.setAttribute("aria-current", b.dataset.azk === cur)); }
}
const azSoon = () => { if (!AZ.raf) AZ.raf = requestAnimationFrame(azRefresh); };
function azGo(k) {
  const h = AZ.heads.find((x) => x.dataset.az === k); if (!h) return;
  if (AZ.sc) AZ.sc.scrollTop += h.getBoundingClientRect().top - AZ.sc.getBoundingClientRect().top - azStick();
  else scrollTo(0, scrollY + h.getBoundingClientRect().top - azStick());
  const b = document.getElementById("az-bub"), r = AZ.box.getBoundingClientRect(), [top, bottom] = azFrame();
  b.textContent = k; b.hidden = false;
  b.style.left = `${Math.max(r.left, 0) + Math.min(r.width, innerWidth) / 2}px`; b.style.top = `${(top + bottom) / 2}px`;
  clearTimeout(AZ.bubT); AZ.bubT = setTimeout(() => { if (!AZ.drag) b.hidden = true; }, 700);
  azSoon();
}
// The letter under a finger: by where it is down the strip, so sliding past the ends still lands on the first or last.
function azAt(y) {
  const r = document.getElementById("az-rail").getBoundingClientRect();
  return AZ.keys[Math.max(0, Math.min(AZ.keys.length - 1, Math.floor(((y - r.top) / r.height) * AZ.keys.length)))];
}
{
  const rail = document.getElementById("az-rail");
  let last = "";
  const at = (e) => { const k = azAt(e.clientY); if (k && k !== last) { last = k; if (typeof haptic === "function") haptic(); azGo(k); } };
  rail.addEventListener("pointerdown", (e) => { e.preventDefault(); AZ.drag = true; last = ""; rail.setPointerCapture(e.pointerId); rail.classList.add("on"); at(e); });
  rail.addEventListener("pointermove", (e) => { if (AZ.drag) at(e); });
  const end = () => { if (!AZ.drag) return; AZ.drag = false; rail.classList.remove("on"); clearTimeout(AZ.bubT); AZ.bubT = setTimeout(() => (document.getElementById("az-bub").hidden = true), 500); };
  rail.addEventListener("pointerup", end); rail.addEventListener("pointercancel", end);
  // A keyboard or a screen reader presses the letter itself.
  rail.addEventListener("click", (e) => { const b = e.target.closest("[data-azk]"); if (b && e.detail === 0) azGo(b.dataset.azk); });
  new MutationObserver(azSoon).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  addEventListener("scroll", azSoon, { passive: true, capture: true });
  addEventListener("resize", azSoon);
}
document.head.insertAdjacentHTML("beforeend", `<style>
.az-h{font-family:var(--display);font-size:20px;line-height:1.2;color:var(--brass);padding:16px 0 4px;border-bottom:1px solid var(--line)}
.az-room{padding-right:30px}
.az-rail{position:fixed;z-index:9;width:28px;display:flex;flex-direction:column;justify-content:space-evenly;align-items:stretch;touch-action:none;user-select:none;-webkit-user-select:none;border-radius:14px}
.az-rail[hidden]{display:none}
.az-rail.on{background:color-mix(in srgb,var(--surface) 85%,transparent)}
.az-rail button{flex:1 1 0;min-height:0;padding:0;border:0;background:none;color:var(--brass);font:inherit;font-weight:800;line-height:1;display:flex;align-items:center;justify-content:center}
.az-rail button[aria-current="true"]{color:var(--fg)}
.az-bub{position:fixed;z-index:30;transform:translate(-50%,-50%);width:84px;height:84px;border-radius:20px;background:var(--brass);color:var(--brass-ink);font-family:var(--display);font-size:52px;line-height:84px;text-align:center;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.35)}
.az-bub[hidden]{display:none}
</style>`);
