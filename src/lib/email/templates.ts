import { DEFAULT_BRAND, settingsFromBrand, uid, type Align, type Block, type Brand, type ChildBlock, type Design } from "./design";

export type TemplateCategory = "General" | "Motorsport" | "Business";

export type StarterTemplate = {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  build: (brand: Partial<Brand>) => Design;
};

// ── Small builders so templates read like layouts, not JSON ─────────────────

const design = (brand: Partial<Brand>, blocks: Block[], preheader = ""): Design => ({
  version: 1,
  settings: { ...settingsFromBrand(brand), preheader },
  blocks,
});

const primary = (b: Partial<Brand>) => b.primary ?? DEFAULT_BRAND.primary;
const tint = (b: Partial<Brand>) => mix(primary(b), "#FFFFFF", 0.9); // pale band of the brand colour

/** Blend two hex colours (t = share of `b`). */
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
}

const logo = (b: Partial<Brand>): Block[] => (b.logoUrl ? [{ id: uid(), type: "logo", align: "center", width: 140 }] : []);
const h = (text: string, level: 1 | 2 | 3 = 2, align: Align = "left"): ChildBlock => ({ id: uid(), type: "heading", text, level, align });
const p = (html: string, align: Align = "left"): ChildBlock => ({ id: uid(), type: "text", html, align });
const img = (alt: string, opts: { width?: number; rounded?: boolean } = {}): ChildBlock => ({ id: uid(), type: "image", src: "", alt, width: opts.width ?? 100, align: "center", rounded: opts.rounded ?? true });
const btn = (label: string, align: Align = "left", fullWidth = false): ChildBlock => ({ id: uid(), type: "button", label, href: "https://", align, fullWidth });
const hr = (): ChildBlock => ({ id: uid(), type: "divider", thickness: 1 });
const gap = (height = 16): ChildBlock => ({ id: uid(), type: "spacer", height });
const cols = (columns: ChildBlock[][], stackOnMobile = true): Block => ({ id: uid(), type: "columns", columns, stackOnMobile });
const band = <T extends Block>(block: T, color: string): T => ({ ...block, sectionBg: color });
const social = (): Block => ({
  id: uid(),
  type: "social",
  align: "center",
  links: [
    { network: "facebook", url: "https://facebook.com/" },
    { network: "instagram", url: "https://instagram.com/" },
  ],
});
const hero = (
  b: Partial<Brand>,
  o: { eyebrow?: string; heading: string; text?: string; button?: string; align?: Align; dark?: boolean },
): Block => ({
  id: uid(),
  type: "hero",
  eyebrow: o.eyebrow ?? "",
  heading: o.heading,
  text: o.text ?? "",
  buttonLabel: o.button ?? "",
  buttonHref: "https://",
  bg: o.dark ? "#111827" : primary(b),
  textColor: "#FFFFFF",
  buttonBg: o.dark ? primary(b) : "#FFFFFF",
  buttonColor: o.dark ? "#FFFFFF" : primary(b),
  align: o.align ?? "center",
});

// ── The library ─────────────────────────────────────────────────────────────

export const STARTER_TEMPLATES: StarterTemplate[] = [
  // General
  {
    id: "blank",
    name: "Blank",
    category: "General",
    description: "Start from nothing.",
    build: (b) => design(b, [...logo(b), p("<p>Hi {{first_name|there}},</p><p></p>")]),
  },
  {
    id: "newsletter",
    name: "Newsletter",
    category: "General",
    description: "Banner, two stories side by side, sign-off.",
    build: (b) =>
      design(b, [
        ...logo(b),
        hero(b, { eyebrow: "The monthly update", heading: "This month at a glance", text: "What’s been happening and what’s coming up.", align: "left" }),
        p("<p>Hi {{first_name|there}},</p><p>Grab a coffee — here’s the short version of everything worth knowing this month.</p>"),
        cols([
          [img("Story one image"), h("Story one", 3), p("<p>A short summary that makes people want to click through.</p>"), btn("Read more")],
          [img("Story two image"), h("Story two", 3), p("<p>Another quick update worth sharing with everyone.</p>"), btn("Read more")],
        ]),
        hr(),
        band(cols([[h("Quick hits", 3), p("<ul><li>One useful link or date</li><li>A shout-out to someone</li><li>A reminder people need</li></ul>")]]), tint(b)),
        p("<p>See you soon,<br><strong>The team</strong></p>"),
        social(),
      ], "What’s new this month"),
  },
  {
    id: "announcement",
    name: "Announcement",
    category: "General",
    description: "One big message, one button.",
    build: (b) =>
      design(b, [
        ...logo(b),
        hero(b, { eyebrow: "News", heading: "Something big is happening", text: "Say the one thing you need to say, clearly and briefly.", button: "Find out more" }),
        p("<p>Hi {{first_name|there}},</p><p>Add a little more detail here: why it matters, what changes, and what people should do next.</p>"),
        p("<p>Thanks,<br><strong>The team</strong></p>"),
        social(),
      ]),
  },
  {
    id: "welcome",
    name: "Welcome",
    category: "General",
    description: "Say hello to new subscribers.",
    build: (b) =>
      design(b, [
        ...logo(b),
        hero(b, { heading: "Welcome aboard, {{first_name|friend}} 👋", text: "Thanks for joining us. Here’s what to expect." }),
        cols([
          [h("📬 News", 3, "center"), p("<p>The important stuff, no more than once or twice a month.</p>", "center")],
          [h("📅 Events", 3, "center"), p("<p>Dates and details before anyone else hears about them.</p>", "center")],
          [h("🎁 Perks", 3, "center"), p("<p>Subscriber-only offers when we have them.</p>", "center")],
        ]),
        hr(),
        p("<p>Got a question? Just hit reply — a real person reads every email.</p>", "center"),
        btn("Visit our website", "center"),
        social(),
      ], "Thanks for joining — here’s what’s next"),
  },
  {
    id: "promo",
    name: "Sale / promo",
    category: "General",
    description: "Offer, code and a deadline.",
    build: (b) =>
      design(b, [
        ...logo(b),
        hero(b, { eyebrow: "This weekend only", heading: "20% off everything", text: "Ends Sunday at midnight.", button: "Shop now", dark: true }),
        band(cols([[p("<p>Use code</p>", "center"), h("FROG20", 1, "center"), p("<p>at checkout</p>", "center")]]), tint(b)),
        cols([
          [img("Product one"), h("Best seller", 3, "center"), btn("Shop", "center")],
          [img("Product two"), h("New in", 3, "center"), btn("Shop", "center")],
        ], false),
        p("<p><small>Offer ends 11:59pm Sunday. Can’t be combined with other offers.</small></p>", "center"),
        social(),
      ], "20% off — this weekend only"),
  },
  {
    id: "event-invite",
    name: "Event invite",
    category: "General",
    description: "When, where and an RSVP button.",
    build: (b) =>
      design(b, [
        ...logo(b),
        hero(b, { eyebrow: "You’re invited", heading: "End of season get-together", text: "Food, drinks and a few awards. Bring a friend.", button: "RSVP now" }),
        band(cols([
          [h("📅 When", 3, "center"), p("<p>Saturday 6 December<br>6:00pm – late</p>", "center")],
          [h("📍 Where", 3, "center"), p("<p>The Clubhouse<br>123 Example Rd, Ipswich</p>", "center")],
        ], false), tint(b)),
        p("<p>Hi {{first_name|there}},</p><p>It’s been a huge year and we’d love to celebrate it with you. Let us know you’re coming so we can sort the catering.</p>"),
        btn("RSVP now", "center"),
        p("<p>Can’t make it? No worries — we’ll share photos after.</p>", "center"),
        social(),
      ], "You’re invited — RSVP inside"),
  },
  {
    id: "feedback",
    name: "Feedback request",
    category: "General",
    description: "Ask how it went, one click to answer.",
    build: (b) =>
      design(b, [
        ...logo(b),
        h("How did we go, {{first_name|there}}?", 1, "center"),
        p("<p>We’d love to know what you thought. It takes one click.</p>", "center"),
        cols([[btn("😍 Loved it", "center", true)], [btn("🙂 It was OK", "center", true)], [btn("😕 Not great", "center", true)]], false),
        gap(8),
        p("<p>Got more to say? Hit reply — we read every response.</p>", "center"),
      ], "One click — tell us how it went"),
  },
  {
    id: "letter",
    name: "Plain letter",
    category: "General",
    description: "Personal note, no frills. Great for deliverability.",
    build: (b) =>
      design(b, [
        p("<p>Hi {{first_name|there}},</p><p>Sometimes the best email looks like it came from a person, because it did.</p><p>Write it the way you’d say it. Keep it short. Ask one thing.</p><p>Cheers,<br><strong>Your name</strong><br>Your role</p>"),
      ]),
  },

  // Motorsport
  {
    id: "event",
    name: "Entries open",
    category: "Motorsport",
    description: "Date, venue, entry fee and a big Enter button.",
    build: (b) =>
      design(b, [
        ...logo(b),
        hero(b, { eyebrow: "Round 4 · Queensland Raceway", heading: "Entries are open 🏁", text: "Grids are limited and fill fast.", button: "Enter now", dark: true }),
        band(cols([
          [h("Date", 3, "center"), p("<p>Sat 14 November</p>", "center")],
          [h("Venue", 3, "center"), p("<p>Queensland Raceway</p>", "center")],
          [h("Entry", 3, "center"), p("<p>$450 per car</p>", "center")],
        ], false), tint(b)),
        p("<p>Hi {{first_name|racer}},</p><p>Lock in your spot, check the supplementary regs, and we’ll see you trackside.</p>"),
        h("On the day", 3),
        p("<ul><li>Gates open 6:30am</li><li>Scrutineering 7:00–8:30am</li><li>Drivers’ briefing 8:45am</li><li>Green flag 9:30am</li></ul>"),
        cols([[btn("Enter now", "left", true)], [btn("Supplementary regs", "left", true)]], false),
        social(),
      ], "Entries are open — grids are limited"),
  },
  {
    id: "results",
    name: "Results are up",
    category: "Motorsport",
    description: "Podium, full results and photos.",
    build: (b) =>
      design(b, [
        ...logo(b),
        hero(b, { eyebrow: "Round 3 results", heading: "What a race 🏆", text: "Thanks to every team, volunteer and official who made it happen." }),
        img("Podium photo"),
        cols([
          [h("🥇", 1, "center"), h("Team name", 3, "center"), p("<p>214 laps</p>", "center")],
          [h("🥈", 1, "center"), h("Team name", 3, "center"), p("<p>213 laps</p>", "center")],
          [h("🥉", 1, "center"), h("Team name", 3, "center"), p("<p>211 laps</p>", "center")],
        ], false),
        cols([[btn("Full results", "center", true)], [btn("Photo gallery", "center", true)]], false),
        hr(),
        band(cols([[h("Next up: Round 4", 3, "center"), p("<p>Saturday 14 November · Queensland Raceway</p>", "center"), btn("Enter now", "center")]]), tint(b)),
        social(),
      ], "Full results and photos inside"),
  },
  {
    id: "final-instructions",
    name: "Final instructions",
    category: "Motorsport",
    description: "Event-week checklist and timetable.",
    build: (b) =>
      design(b, [
        ...logo(b),
        hero(b, { eyebrow: "This Saturday", heading: "Final instructions", text: "Everything you need for race day, {{first_name|racer}}.", align: "left", dark: true }),
        h("✅ Bring with you", 2),
        p("<ul><li>Licence and entry confirmation</li><li>Helmet, HANS and race suit</li><li>Fire extinguisher (in date)</li><li>Fuel in approved containers</li><li>Sunscreen, water, chairs</li></ul>"),
        h("⏱ Timetable", 2),
        band(cols([
          [p("<p><strong>6:30am</strong><br><strong>7:00am</strong><br><strong>8:45am</strong><br><strong>9:30am</strong><br><strong>3:30pm</strong></p>")],
          [p("<p>Gates open<br>Scrutineering<br>Drivers’ briefing<br>Race start<br>Chequered flag</p>")],
        ], false), tint(b)),
        cols([[btn("Track map", "left", true)], [btn("Supplementary regs", "left", true)]], false),
        p("<p>Questions on the day? Find race control in the tower, or call 0400 000 000.</p>"),
      ], "Race day checklist and timetable"),
  },
  {
    id: "season",
    name: "Season calendar",
    category: "Motorsport",
    description: "Launch next season’s dates.",
    build: (b) =>
      design(b, [
        ...logo(b),
        hero(b, { eyebrow: "Save the dates", heading: "The 2027 calendar is here", text: "Six rounds. Three tracks. One championship.", button: "Early-bird entries" }),
        ...[
          ["Round 1", "Sat 13 Feb", "Queensland Raceway"],
          ["Round 2", "Sat 10 Apr", "Morgan Park"],
          ["Round 3", "Sat 12 Jun", "Lakeside Park"],
          ["Round 4", "Sat 14 Aug", "Queensland Raceway"],
        ].map(([r, d, v], i) => {
          const row = cols([[h(r, 3)], [p(`<p>${d}</p>`)], [p(`<p>${v}</p>`)]], false);
          return i % 2 ? row : band(row, tint(b));
        }),
        p("<p>Early-bird pricing closes 31 December. Season entries get priority on every grid.</p>", "center"),
        btn("Enter the season", "center"),
        social(),
      ], "Next season’s dates are locked in"),
  },

  // Business
  {
    id: "service-reminder",
    name: "Service reminder",
    category: "Business",
    description: "“Your car is due” with a book-now button.",
    build: (b) =>
      design(b, [
        ...logo(b),
        h("Hi {{first_name|there}}, your {{vehicle|car}} is due for a service", 1),
        p("<p>Our records show your next service is coming up. Regular servicing keeps your warranty intact, saves fuel and catches small problems before they get expensive.</p>"),
        band(cols([[h("Rego", 3), p("<p>{{rego|—}}</p>")], [h("Due", 3), p("<p>{{service_due|this month}}</p>")]], false), tint(b)),
        btn("Book online", "left"),
        p("<p>Prefer to call? Ring us on (07) 0000 0000 and we’ll find a time that suits.</p>"),
        hr(),
        p("<p><small>Already booked in? Ignore this one — see you soon.</small></p>"),
      ], "Book your next service in a couple of clicks"),
  },
  {
    id: "monthly-special",
    name: "Monthly specials",
    category: "Business",
    description: "Two offers side by side.",
    build: (b) =>
      design(b, [
        ...logo(b),
        hero(b, { eyebrow: "This month’s specials", heading: "Get summer-ready", text: "Two deals, this month only.", button: "Book now" }),
        cols([
          [img("Offer one"), h("Air-con regas", 3), p("<p>Beat the heat. Includes leak check.</p>"), h("$149", 2), btn("Book")],
          [img("Offer two"), h("Logbook service", 3), p("<p>Keep your warranty. Free health check.</p>"), h("from $289", 2), btn("Book")],
        ]),
        p("<p><small>Prices include GST. Valid until the end of the month while bookings last.</small></p>", "center"),
        social(),
      ], "This month’s specials inside"),
  },
];

export const TEMPLATE_CATEGORIES: TemplateCategory[] = ["General", "Motorsport", "Business"];

export const getStarter = (id: string) => STARTER_TEMPLATES.find((t) => t.id === id) ?? STARTER_TEMPLATES[0];
