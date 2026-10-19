"use client";
import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";

const lightTheme = EditorView.theme({
  "&": { backgroundColor: "#FFFFFF" },
  ".cm-gutters": { backgroundColor: "#F8FAF7", borderRight: "1px solid #E5E7EB", color: "#9CA3AF" },
  ".cm-activeLine": { backgroundColor: "#F0FDF4" },
  ".cm-activeLineGutter": { backgroundColor: "#DCFCE7", color: "#0F5132" },
});

const base = EditorView.theme({
  "&": { height: "100%", fontSize: "var(--cm-font-size, 14px)" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: "1.6" },
  ".cm-content": { padding: "12px 0" },
});

/** CodeMirror 6 HTML editor. Uncontrolled after mount: `value` seeds it, `onChange` reports edits. */
export function CodeEditor({
  value,
  onChange,
  dark,
  wrap,
  fontSize,
  onSave,
}: {
  value: string;
  onChange: (v: string) => void;
  dark: boolean;
  wrap: boolean;
  fontSize: number;
  onSave?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const theme = useRef(new Compartment());
  const wrapping = useRef(new Compartment());
  const change = useRef(onChange);
  const save = useRef(onSave);
  change.current = onChange;
  save.current = onSave;

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          html({ autoCloseTags: true }),
          base,
          theme.current.of(dark ? oneDark : lightTheme),
          wrapping.current.of(wrap ? EditorView.lineWrapping : []),
          keymap.of([
            { key: "Mod-s", preventDefault: true, run: () => (save.current?.(), true) },
            { key: "Mod-Enter", preventDefault: true, run: () => (save.current?.(), true) },
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) change.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    v.focus();
    return () => v.destroy();
    // Seed once; later `value` changes come from this editor itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: theme.current.reconfigure(dark ? oneDark : lightTheme) });
  }, [dark]);
  useEffect(() => {
    view.current?.dispatch({ effects: wrapping.current.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap]);

  return <div ref={host} className="h-full overflow-hidden" style={{ ["--cm-font-size" as string]: `${fontSize}px` }} />;
}
