import editor from './editor.js'
import parse from './parse.js'
import dump from './dump.js'

function $<E extends Element = Element>(id: string): E {
  const $element = document.querySelector<E>(`#${id}`)
  if (!$element) {
    throw Error(`Invalid element "#${id}"!`)
  }
  return $element
}

const $run = $<HTMLButtonElement>('run')
const $editor = $<HTMLDivElement>('editor')
const $pos = $<HTMLOutputElement>('pos')
let source = localStorage.getItem('editor.content') ?? ''

editor(
  $editor,
  'var(--pico-font-family)',
  2,
  source,
  (content) => {
    source = content
    localStorage.setItem('editor.content', content)
  },
  (line, col) => {
    $pos.value = `Ln ${line}, Col ${col}`
  },
)

$run.addEventListener('click', () => {
  const { value, error } = parse(source)
  if (value) {
    dump(value)
  }
  if (error) {
    const {
      code,
      pos: { line, col },
    } = error
    console.error(`${code} ${line}:${col}`)
  }
})
