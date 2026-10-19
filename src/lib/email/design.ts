// Email design model: a list of blocks stored as JSON, rendered to MJML → email-safe HTML.
// Shared by the editor (client) and the renderer (server).

export type Align = "left" | "center" | "right";

export type Brand = {
  logoUrl?: string;
  primary: string;     // buttons, accents
  text: string;        // body text
  background: string;  // outer background
  content: string;     // email body background
  font: string;        // key of FONTS
};

export const DEFAULT_BRAND: Brand = {
  primary: "#15803D",
  text: "#1F2937",
  background: "#F8FAF7",
  content: "#FFFFFF",
  font: "inter",
};

export const FONTS: Record<string, { label: string; stack: string; href?: string }> = {
  inter: { label: "Inter", stack: "Inter, Helvetica, Arial, sans-serif", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" },
  helvetica: { label: "Helvetica / Arial", stack: "Helvetica, Arial, sans-serif" },
  georgia: { label: "Georgia (serif)", stack: "Georgia, 'Times New Roman', serif" },
  verdana: { label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  trebuchet: { label: "Trebuchet", stack: "'Trebuchet MS', Helvetica, sans-serif" },
  montserrat: { label: "Montserrat", stack: "Montserrat, Helvetica, Arial, sans-serif", href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800&display=swap" },
};

export const SOCIAL_NETWORKS = ["facebook", "instagram", "x", "youtube", "linkedin", "web"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

type Base = { id: string };
export type HeadingBlock = Base & { type: "heading"; text: string; level: 1 | 2 | 3; align: Align; color?: string };
export type TextBlock = Base & { type: "text"; html: string; align: Align };
export type ImageBlock = Base & { type: "image"; src: string; alt: string; href?: string; width: number; align: Align; rounded?: boolean };
export type ButtonBlock = Base & { type: "button"; label: string; href: string; align: Align; bg?: string; color?: string; fullWidth?: boolean };
export type DividerBlock = Base & { type: "divider"; color?: string; thickness: number };
export type SpacerBlock = Base & { type: "spacer"; height: number };
export type LogoBlock = Base & { type: "logo"; align: Align; width: number };
export type SocialBlock = Base & { type: "social"; align: Align; links: { network: SocialNetwork; url: string }[] };
export type HtmlBlock = Base & { type: "html"; html: string };

export type ChildBlock = HeadingBlock | TextBlock | ImageBlock | ButtonBlock | DividerBlock | SpacerBlock;
export type ColumnsBlock = Base & { type: "columns"; columns: ChildBlock[][]; stackOnMobile: boolean };

export type Block = ChildBlock | LogoBlock | SocialBlock | HtmlBlock | ColumnsBlock;
export type BlockType = Block["type"];

export type DesignSettings = {
  background: string;
  contentBackground: string;
  textColor: string;
  linkColor: string;
  buttonColor: string;
  font: string;
  preheader: string;
};

export type Design = { version: 1; settings: DesignSettings; blocks: Block[] };

export const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)).slice(0, 8);

export function settingsFromBrand(b: Partial<Brand> = {}): DesignSettings {
  const brand = { ...DEFAULT_BRAND, ...b };
  return {
    background: brand.background,
    contentBackground: brand.content,
    textColor: brand.text,
    linkColor: brand.primary,
    buttonColor: brand.primary,
    font: brand.font,
    preheader: "",
  };
}

/** A fresh block with sensible defaults. */
export function newBlock(type: BlockType): Block {
  const id = uid();
  switch (type) {
    case "heading": return { id, type, text: "Your headline here", level: 1, align: "left" };
    case "text": return { id, type, html: "<p>Hi {{first_name|there}},</p><p>Write something worth reading.</p>", align: "left" };
    case "image": return { id, type, src: "", alt: "", width: 100, align: "center" };
    case "button": return { id, type, label: "Find out more", href: "https://", align: "left" };
    case "divider": return { id, type, thickness: 1 };
    case "spacer": return { id, type, height: 24 };
    case "logo": return { id, type, align: "center", width: 140 };
    case "social": return { id, type, align: "center", links: [{ network: "facebook", url: "https://facebook.com/" }, { network: "instagram", url: "https://instagram.com/" }] };
    case "html": return { id, type, html: "<p style=\"margin:0\">Custom HTML</p>" };
    case "columns": return {
      id, type, stackOnMobile: true,
      columns: [
        [{ id: uid(), type: "image", src: "", alt: "", width: 100, align: "center" }, { id: uid(), type: "text", html: "<p>Left column</p>", align: "left" }],
        [{ id: uid(), type: "image", src: "", alt: "", width: 100, align: "center" }, { id: uid(), type: "text", html: "<p>Right column</p>", align: "left" }],
      ],
    };
  }
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  logo: "Logo",
  heading: "Heading",
  text: "Text",
  image: "Image",
  button: "Button",
  columns: "Columns",
  divider: "Divider",
  spacer: "Spacer",
  social: "Social",
  html: "HTML",
};

export const CHILD_TYPES: ChildBlock["type"][] = ["heading", "text", "image", "button", "divider", "spacer"];

export function emptyDesign(brand?: Partial<Brand>): Design {
  return { version: 1, settings: settingsFromBrand(brand), blocks: [] };
}

/** Minimal shape check for designs arriving from the client or the API. */
export function isDesign(v: unknown): v is Design {
  const d = v as Design;
  return !!d && d.version === 1 && typeof d.settings === "object" && Array.isArray(d.blocks);
}
