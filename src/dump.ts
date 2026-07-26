import type { Expression } from './parse.js'

function dumpChunks(
  chunks: Array<string>,
  {
    token: {
      kind,
      value,
      pos: { line, col },
    },
    lhs,
    rhs,
  }: Expression,
  indent = 0,
) {
  chunks.push(`${'  '.repeat(indent)}▸ ${kind}`)
  if (value != undefined) {
    chunks.push(` ${value}`)
  }
  chunks.push(` ${line}:${col}\n`)
  if (lhs) {
    dumpChunks(chunks, lhs, indent + 1)
  }
  if (rhs) {
    dumpChunks(chunks, rhs, indent + 1)
  }
}

export default function dump(expr: Expression) {
  const chunks: Array<string> = []
  dumpChunks(chunks, expr)
  console.log(chunks.join(''))
}

declare global {
  var dump: (expr: Expression) => void
}

globalThis.dump = dump
