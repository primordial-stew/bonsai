import {
  history,
  historyKeymap,
  indentWithTab,
  standardKeymap,
} from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'

const colorScheme = window.matchMedia('(prefers-color-scheme: light)')

export default function (
  parent: Element,
  fontFamily: string,
  tabSize: number,
  content: string,
  onContentChange: (content: string) => void,
  onPosChange: (line: number, col: number) => void,
) {
  const theme = new Compartment()
  const themeSpec = { '.cm-content': { fontFamily } }
  const lightTheme = EditorView.theme(themeSpec, { dark: false })
  const darkTheme = EditorView.theme(themeSpec, { dark: true })
  const view = new EditorView({
    parent,
    state: EditorState.create({
      extensions: [
        theme.of(colorScheme.matches ? lightTheme : darkTheme),
        keymap.of([...standardKeymap, ...historyKeymap, indentWithTab]),
        history(),
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        indentUnit.of('\t'),
        EditorState.tabSize.of(tabSize),
        EditorView.updateListener.of(
          ({ docChanged, selectionSet, state: { doc, selection } }) => {
            if (docChanged) {
              // TODO maybe debounce this
              onContentChange(doc.toString())
            }
            if (selectionSet) {
              const { head } = selection.main
              const line = doc.lineAt(head)
              onPosChange(line.number, head - line.from + 1)
            }
          },
        ),
      ],
      doc: content,
    }),
  })
  colorScheme.addEventListener('change', ({ matches }) => {
    view.dispatch({
      effects: theme.reconfigure(matches ? lightTheme : darkTheme),
    })
  })
}
