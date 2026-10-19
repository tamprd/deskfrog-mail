"use client";
import { useEffect } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";

export const MERGE_TAGS = [
  { tag: "{{first_name|there}}", label: "First name" },
  { tag: "{{last_name}}", label: "Last name" },
  { tag: "{{email}}", label: "Email" },
];

function Btn({ on, active, label, children }: { on: () => void; active?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => {
        e.preventDefault(); // keep the text selection
        on();
      }}
      className={`grid h-7 min-w-7 place-items-center rounded px-1.5 text-sm ${active ? "bg-frog-700 text-white" : "text-ink hover:bg-frog-50"}`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, swatches }: { editor: Editor; swatches: string[] }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      h2: e.isActive("heading", { level: 2 }),
      quote: e.isActive("blockquote"),
    }),
  });
  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link URL", prev ?? "https://");
    if (href === null) return;
    if (href === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-0.5 rounded-t-lg border-b border-line bg-white p-1 shadow-sm" role="toolbar" aria-label="Text formatting">
      <Btn label="Bold" active={s.bold} on={() => editor.chain().focus().toggleBold().run()}><b>B</b></Btn>
      <Btn label="Italic" active={s.italic} on={() => editor.chain().focus().toggleItalic().run()}><i>I</i></Btn>
      <Btn label="Underline" active={s.underline} on={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></Btn>
      <Btn label="Strikethrough" active={s.strike} on={() => editor.chain().focus().toggleStrike().run()}><s>S</s></Btn>
      <span className="mx-1 h-5 w-px bg-line" />
      <Btn label="Subheading" active={s.h2} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H</Btn>
      <Btn label="Bulleted list" active={s.bullet} on={() => editor.chain().focus().toggleBulletList().run()}>•</Btn>
      <Btn label="Numbered list" active={s.ordered} on={() => editor.chain().focus().toggleOrderedList().run()}>1.</Btn>
      <Btn label="Quote" active={s.quote} on={() => editor.chain().focus().toggleBlockquote().run()}>❝</Btn>
      <Btn label="Link" active={s.link} on={setLink}>🔗</Btn>
      <span className="mx-1 h-5 w-px bg-line" />
      {swatches.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Text colour ${c}`}
          title={c}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().setColor(c).run();
          }}
          className="h-5 w-5 rounded-full border border-line"
          style={{ background: c }}
        />
      ))}
      <Btn label="Clear colour" on={() => editor.chain().focus().unsetColor().run()}>⦸</Btn>
      <span className="mx-1 h-5 w-px bg-line" />
      <select
        aria-label="Insert merge tag"
        className="h-7 rounded border border-line bg-white px-1 text-xs"
        value=""
        onChange={(e) => {
          if (e.target.value) editor.chain().focus().insertContent(e.target.value).run();
        }}
      >
        <option value="">+ Merge tag</option>
        {MERGE_TAGS.map((m) => <option key={m.tag} value={m.tag}>{m.label}</option>)}
      </select>
    </div>
  );
}

/** Inline rich-text editor used directly on the canvas. Emits HTML. */
export function RichText({
  html,
  onChange,
  active,
  swatches,
  style,
}: {
  html: string;
  onChange: (html: string) => void;
  active: boolean;
  swatches: string[];
  style: React.CSSProperties;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2] }, link: { openOnClick: false, autolink: true }, code: false, codeBlock: false, horizontalRule: false }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ["paragraph", "heading"] }),
    ],
    content: html,
    editable: active,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: { attributes: { class: "df-rich outline-none" } },
  });

  useEffect(() => {
    editor?.setEditable(active);
    if (active) editor?.commands.focus("end");
  }, [editor, active]);

  if (!editor) return <div style={{ ...style, minHeight: 24 }} className="df-rich" />;
  return (
    <div>
      {active && <Toolbar editor={editor} swatches={swatches} />}
      <div style={style}><EditorContent editor={editor} /></div>
    </div>
  );
}
