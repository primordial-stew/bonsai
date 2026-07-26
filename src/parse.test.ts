import { fc } from '@fast-check/vitest'
import { Arbitrary } from 'fast-check'
import parse from './parse.js'
import type { Expression, ParseError } from './parse.js'
import describe, { test } from './test.js'

// TODO this should be defined by parser.ts
//      Expression and ParseError probably don't need to be exported
interface Output {
  value?: Expression
  error?: ParseError
}

const { array, constant, constantFrom, integer, nat, oneof, string, tuple } = fc

function textFrom(chars: string, minLength: number = 0): Arbitrary<string> {
  return string({ unit: charFrom(chars), minLength })
}

function charFrom(chars: string): Arbitrary<string> {
  return constantFrom(...chars)
}

function charOf(unit: 'binary-ascii'): Arbitrary<string> {
  return string({ unit, minLength: 1, maxLength: 1 })
}

function charBetween(min: number, max: number): Arbitrary<string> {
  return integer({ min, max }).map(String.fromCharCode)
}

function newline(
  indent: number = 0,
): Arbitrary<{ text: string; lines: Array<string> }> {
  const last = `\n${'\t'.repeat(indent)}`
  return array(textFrom('\t ').map((indent) => `\n${indent}`)).map((rest) => ({
    text: `${rest.join('')}${last}`,
    // TODO maybe just return the length, the entire lines array might not be needed anymore
    lines: [...rest, last],
  }))
}

function punct(): Arbitrary<{ text: string; value: string }> {
  return textFrom('!%&*+--./:;<=>?@^|~', 1).map((value) => ({
    text: value,
    value,
  }))
}

function atom(): Arbitrary<{
  kind: string
  text: string
  value: string | number
}> {
  return oneof(alnum(), nonQuoteChar(), int())
}

function alnum(): Arbitrary<{ kind: string; text: string; value: string }> {
  return tuple(
    charFrom('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_'),
    textFrom('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_0123456789'),
  )
    .map(([first, rest]) => `${first}${rest}`)
    .map((value) => ({ kind: 'alnum', text: value, value }))
}

function nonQuoteChar(): Arbitrary<{
  kind: string
  text: string
  value: string
}> {
  return charOf('binary-ascii')
    .filter((value) => value !== "'")
    .map((value) => ({ kind: 'char', text: `'${value}'`, value }))
}

function int(): Arbitrary<{ kind: string; text: string; value: number }> {
  return nat().map((value) => ({ kind: 'int', text: `${value}`, value }))
}

function space(minLength: number = 0): Arbitrary<{ text: string }> {
  return textFrom('\t ', minLength).map((text) => ({ text }))
}

function valid(value: Expression): Output {
  return { value }
}

function error(code: string, line: number, col: number): Output {
  return {
    error: { code, pos: { line, col } },
  }
}

function infix(
  kind: string,
  line: number,
  col: number,
  value: string | number | undefined,
  lhs: Expression,
  rhs: Expression,
): Expression {
  return { token: { kind, value, pos: { line, col } }, lhs, rhs }
}

function prefix(
  kind: string,
  line: number,
  col: number,
  value: string | number,
  rhs?: Expression,
): Expression {
  return { token: { kind, value, pos: { line, col } }, rhs }
}

function leaf(
  kind: string,
  line: number,
  col: number,
  value: string | number,
): Expression {
  return { token: { kind, value, pos: { line, col } } }
}

function concat(...tokens: Array<{ text: string }>): string {
  return tokens.map(({ text }) => text).join('')
}

function line(...tokens: Array<{ lines: Array<string> }>): number {
  return tokens.reduce((sum, { lines }) => sum + lines.length, 1)
}

function col(...tokens: Array<{ text: string }>): number {
  return tokens.reduce((sum, { text }) => sum + text.length, 1)
}

describe<string, Output>((source) => parse(source), {
  empty: test(constant(''), (text) => ({
    given: text,
    expect: error('invalid_expr', 1, 1),
  })),
  newline: test(
    array(
      textFrom('\t ').map((indent) => `\n${indent}`),
      { minLength: 1 },
    ).map((lines) => ({ text: lines.join(''), lines })),
    ({ text, lines }) => ({
      given: text,
      // TODO line and col should be at the beginning of the newline token
      expect: error(
        'invalid_expr',
        lines.length + 1,
        lines.at(-1)?.length ?? 1,
      ),
    }),
  ),
  punct: test(punct(), ({ text }) => ({
    given: text,
    expect: error('invalid_expr', 1, 1),
  })),
  alnum: test(alnum(), ({ text, value }) => ({
    given: text,
    expect: valid(leaf('alnum', 1, 1, value)),
  })),
  char: test(nonQuoteChar(), ({ text, value }) => ({
    given: text,
    expect: valid(leaf('char', 1, 1, value)),
  })),
  int: test(int(), ({ text, value }) => ({
    given: text,
    expect: valid(leaf('int', 1, 1, value)),
  })),
  space: test(space(1), ({ text }) => ({
    given: text,
    // TODO should col be just 1?
    expect: error('invalid_expr', 1, text.length + 1),
  })),
  invalid: test(
    oneof(
      charFrom(
        '\0\x01\x02\x03\x04\x05\x06\x07\b\v\f\r' +
          '\x0e\x0f\x10\x11\x12\x13\x14\x15\x16' +
          '\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f' +
          '"#$(),[\\]`{}',
      ),
      charBetween(0x7f, 0x10ffff),
    ),
    (text) => ({
      given: text,
      expect: error('invalid_token', 1, 1),
    }),
  ),
  atom: test(tuple(atom(), space(1)), ([atom, space]) => ({
    given: concat(atom, space),
    expect: valid(leaf(atom.kind, 1, 1, atom.value)),
  })),
  newline_atom: test(tuple(newline(), atom()), ([newline, atom]) => ({
    given: concat(newline, atom),
    expect: valid(leaf(atom.kind, line(newline), 1, atom.value)),
  })),
  alnum_atom: test(
    tuple(alnum(), space(1), atom()),
    ([alnum, space, atom]) => ({
      given: concat(alnum, space, atom),
      expect: valid(
        prefix(
          'alnum',
          1,
          1,
          alnum.value,
          leaf(atom.kind, 1, col(alnum, space), atom.value),
        ),
      ),
    }),
  ),
  alnum_indent_atom: test(
    tuple(alnum(), space(), newline(1), atom()),
    ([alnum, space, indent, atom]) => ({
      given: concat(alnum, space, indent, atom),
      expect: valid(
        prefix(
          'alnum',
          1,
          1,
          alnum.value,
          leaf(atom.kind, line(indent), 2, atom.value),
        ),
      ),
    }),
  ),
  atom_newline_atom: test(
    tuple(atom(), space(), newline(), atom()),
    ([left, lsp, newline, right]) => ({
      given: concat(left, lsp, newline, right),
      expect: valid(
        infix(
          'newline',
          1,
          col(left, lsp),
          undefined,
          leaf(left.kind, 1, 1, left.value),
          leaf(right.kind, line(newline), 1, right.value),
        ),
      ),
    }),
  ),
  atom_punct_atom: test(
    tuple(atom(), space(), punct(), space(), atom()),
    ([left, lsp, punct, rsp, right]) => ({
      given: concat(left, lsp, punct, rsp, right),
      expect: valid(
        infix(
          'punct',
          1,
          col(left, lsp),
          punct.value,
          leaf(left.kind, 1, 1, left.value),
          leaf(right.kind, 1, col(left, lsp, punct, rsp), right.value),
        ),
      ),
    }),
  ),
  alnum_atom_newline_atom: test(
    tuple(alnum(), space(1), atom(), newline(), atom()),
    ([left, lsp, atom, newline, right]) => ({
      given: concat(left, lsp, atom, newline, right),
      expect: valid(
        infix(
          'newline',
          1,
          col(left, lsp, atom),
          undefined,
          prefix(
            'alnum',
            1,
            1,
            left.value,
            leaf(atom.kind, 1, col(left, lsp), atom.value),
          ),
          leaf(right.kind, line(newline), 1, right.value),
        ),
      ),
    }),
  ),
  alnum_atom_punct_atom: test(
    tuple(alnum(), space(1), atom(), punct(), atom()),
    ([left, lsp, atom, punct, right]) => ({
      given: concat(left, lsp, atom, punct, right),
      expect: valid(
        infix(
          'punct',
          1,
          col(left, lsp, atom),
          punct.value,
          prefix(
            'alnum',
            1,
            1,
            left.value,
            leaf(atom.kind, 1, col(left, lsp), atom.value),
          ),
          leaf(right.kind, 1, col(left, lsp, atom, punct), right.value),
        ),
      ),
    }),
  ),
  atom_punct_alnum_atom: test(
    tuple(atom(), punct(), alnum(), space(1), atom()),
    ([left, punct, right, rsp, atom]) => ({
      given: concat(left, punct, right, rsp, atom),
      expect: valid(
        infix(
          'punct',
          1,
          col(left),
          punct.value,
          leaf(left.kind, 1, 1, left.value),
          prefix(
            'alnum',
            1,
            col(left, punct),
            right.value,
            leaf(atom.kind, 1, col(left, punct, right, rsp), atom.value),
          ),
        ),
      ),
    }),
  ),
  alnum_indent_atom_dedent_atom: test(
    tuple(alnum(), newline(1), atom(), newline(), atom()),
    ([left, ind, mid, ded, right]) => ({
      given: concat(left, ind, mid, ded, right),
      expect: valid(
        infix(
          'newline',
          line(ind),
          col(mid) + 1,
          undefined,
          prefix(
            'alnum',
            1,
            1,
            left.value,
            leaf(mid.kind, line(ind), 2, mid.value),
          ),
          leaf(right.kind, line(ind, ded), 1, right.value),
        ),
      ),
    }),
  ),
  alnum_indent_alnum_indent_atom: test(
    tuple(alnum(), newline(1), alnum(), newline(2), atom()),
    ([left, lind, mid, rind, right]) => ({
      given: concat(left, lind, mid, rind, right),
      expect: valid(
        prefix(
          'alnum',
          1,
          1,
          left.value,
          prefix(
            'alnum',
            line(lind),
            2,
            mid.value,
            leaf(right.kind, line(lind, rind), 3, right.value),
          ),
        ),
      ),
    }),
  ),
  alnum_indent_atom_punct_atom: test(
    tuple(alnum(), newline(1), atom(), punct(), atom()),
    ([left, ind, mid, rop, right]) => ({
      given: concat(left, ind, mid, rop, right),
      expect: valid(
        prefix(
          'alnum',
          1,
          1,
          left.value,
          infix(
            'punct',
            line(ind),
            col(mid) + 1,
            rop.value,
            leaf(mid.kind, line(ind), 2, mid.value),
            leaf(right.kind, line(ind), col(mid, rop) + 1, right.value),
          ),
        ),
      ),
    }),
  ),
  atom_newline_atom_punct_atom: test(
    tuple(atom(), newline(), atom(), punct(), atom()),
    ([left, nl, mid, rop, right]) => ({
      given: concat(left, nl, mid, rop, right),
      expect: valid(
        infix(
          'newline',
          1,
          col(left),
          undefined,
          leaf(left.kind, 1, 1, left.value),
          infix(
            'punct',
            line(nl),
            col(mid),
            rop.value,
            leaf(mid.kind, line(nl), 1, mid.value),
            leaf(right.kind, line(nl), col(mid, rop), right.value),
          ),
        ),
      ),
    }),
  ),
  atom_punct_atom_punct_atom: test(
    tuple(atom(), punct(), atom(), punct(), atom()),
    ([left, lop, mid, rop, right]) => ({
      given: concat(left, lop, mid, rop, right),
      expect: valid(
        infix(
          'punct',
          1,
          col(left),
          lop.value,
          leaf(left.kind, 1, 1, left.value),
          infix(
            'punct',
            1,
            col(left, lop, mid),
            rop.value,
            leaf(mid.kind, 1, col(left, lop), mid.value),
            leaf(right.kind, 1, col(left, lop, mid, rop), right.value),
          ),
        ),
      ),
    }),
  ),
  alnum_indent_indent_atom_dedent: test(
    tuple(alnum(), newline(2), atom(), newline()),
    ([left, ind, mid, ded]) => ({
      given: concat(left, ind, mid, ded),
      expect: error('mismatched_indent', line(ind), col(mid) + 2),
    }),
  ),
  alnum_indent_indent_atom_dedent_atom: test(
    tuple(alnum(), newline(2), atom(), newline(), atom()),
    ([left, ind, mid, ded, right]) => ({
      given: concat(left, ind, mid, ded, right),
      expect: error('mismatched_indent', line(ind), col(mid) + 2),
    }),
  ),
})
