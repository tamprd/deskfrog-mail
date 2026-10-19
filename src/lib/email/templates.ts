import { settingsFromBrand, uid, type Block, type Brand, type Design } from "./design";

export type StarterTemplate = {
  id: string;
  name: string;
  description: string;
  build: (brand: Partial<Brand>) => Design;
};

const d = (brand: Partial<Brand>, blocks: Block[], preheader = ""): Design => ({
  version: 1,
  settings: { ...settingsFromBrand(brand), preheader },
  blocks,
});

const logo = (brand: Partial<Brand>): Block[] => (brand.logoUrl ? [{ id: uid(), type: "logo", align: "center", width: 140 }] : []);
const footerSocial: Block = {
  id: "",
  type: "social",
  align: "center",
  links: [
    { network: "facebook", url: "https://facebook.com/" },
    { network: "instagram", url: "https://instagram.com/" },
  ],
};
const social = (): Block => ({ ...footerSocial, id: uid() });

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "blank",
    name: "Blank",
    description: "Start from nothing.",
    build: (b) => d(b, [...logo(b), { id: uid(), type: "text", html: "<p>Hi {{first_name|there}},</p><p></p>", align: "left" }]),
  },
  {
    id: "newsletter",
    name: "Newsletter",
    description: "Hero image, a few stories, sign-off.",
    build: (b) =>
      d(b, [
        ...logo(b),
        { id: uid(), type: "image", src: "", alt: "Hero image", width: 100, align: "center", rounded: true },
        { id: uid(), type: "heading", text: "This month at a glance", level: 1, align: "left" },
        { id: uid(), type: "text", align: "left", html: "<p>Hi {{first_name|there}},</p><p>Here’s what’s been happening and what’s coming up. Grab a coffee.</p>" },
        { id: uid(), type: "divider", thickness: 1 },
        {
          id: uid(), type: "columns", stackOnMobile: true,
          columns: [
            [
              { id: uid(), type: "image", src: "", alt: "", width: 100, align: "center", rounded: true },
              { id: uid(), type: "heading", text: "Story one", level: 3, align: "left" },
              { id: uid(), type: "text", align: "left", html: "<p>A short summary that makes people want to click.</p>" },
              { id: uid(), type: "button", label: "Read more", href: "https://", align: "left" },
            ],
            [
              { id: uid(), type: "image", src: "", alt: "", width: 100, align: "center", rounded: true },
              { id: uid(), type: "heading", text: "Story two", level: 3, align: "left" },
              { id: uid(), type: "text", align: "left", html: "<p>Another quick update worth sharing.</p>" },
              { id: uid(), type: "button", label: "Read more", href: "https://", align: "left" },
            ],
          ],
        },
        { id: uid(), type: "divider", thickness: 1 },
        { id: uid(), type: "text", align: "left", html: "<p>See you soon,<br>The team</p>" },
        social(),
      ], "What’s new this month"),
  },
  {
    id: "event",
    name: "Event — entries open",
    description: "Date, venue, big call to action.",
    build: (b) =>
      d(b, [
        ...logo(b),
        { id: uid(), type: "image", src: "", alt: "Event banner", width: 100, align: "center", rounded: true },
        { id: uid(), type: "heading", text: "Entries are open 🏁", level: 1, align: "center" },
        { id: uid(), type: "text", align: "center", html: "<p><strong>Round 4 · Saturday 14 November</strong><br>Queensland Raceway, Willowbank</p>" },
        { id: uid(), type: "button", label: "Enter now", href: "https://", align: "center", fullWidth: false },
        { id: uid(), type: "spacer", height: 8 },
        { id: uid(), type: "text", align: "left", html: "<p>Hi {{first_name|racer}},</p><p>Grids are limited and fill fast. Lock in your spot, check the supplementary regs, and we’ll see you trackside.</p><ul><li>Gates open 6:30am</li><li>Scrutineering 7:00–8:30am</li><li>Drivers’ briefing 8:45am</li></ul>" },
        { id: uid(), type: "divider", thickness: 1 },
        social(),
      ], "Entries are open — grids are limited"),
  },
  {
    id: "results",
    name: "Results are up",
    description: "Celebrate the winners, link to full results.",
    build: (b) =>
      d(b, [
        ...logo(b),
        { id: uid(), type: "heading", text: "Results are in 🏆", level: 1, align: "center" },
        { id: uid(), type: "text", align: "center", html: "<p>Thanks to everyone who came out. What a day.</p>" },
        { id: uid(), type: "image", src: "", alt: "Podium photo", width: 100, align: "center", rounded: true },
        {
          id: uid(), type: "columns", stackOnMobile: false,
          columns: [
            [{ id: uid(), type: "heading", text: "🥇 1st", level: 3, align: "center" }, { id: uid(), type: "text", align: "center", html: "<p>Team name</p>" }],
            [{ id: uid(), type: "heading", text: "🥈 2nd", level: 3, align: "center" }, { id: uid(), type: "text", align: "center", html: "<p>Team name</p>" }],
            [{ id: uid(), type: "heading", text: "🥉 3rd", level: 3, align: "center" }, { id: uid(), type: "text", align: "center", html: "<p>Team name</p>" }],
          ],
        },
        { id: uid(), type: "button", label: "Full results", href: "https://", align: "center" },
        { id: uid(), type: "divider", thickness: 1 },
        social(),
      ], "Full results and photos inside"),
  },
  {
    id: "announcement",
    name: "Announcement",
    description: "One message, one button.",
    build: (b) =>
      d(b, [
        ...logo(b),
        { id: uid(), type: "heading", text: "Big news", level: 1, align: "left" },
        { id: uid(), type: "text", align: "left", html: "<p>Hi {{first_name|there}},</p><p>Say the one thing you need to say, clearly and briefly.</p>" },
        { id: uid(), type: "button", label: "Learn more", href: "https://", align: "left" },
      ]),
  },
];

export const getStarter = (id: string) => STARTER_TEMPLATES.find((t) => t.id === id) ?? STARTER_TEMPLATES[0];
