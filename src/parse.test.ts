import { fc } from '@fast-check/vitest'
import parse from './parse.js'
import type { Expression, ParseError } from './parse.js'
import describe, { test } from './test.js'

// TODO this should be defined by parser.ts
//      Expression and ParseError probably don't need to be exported
interface Output {
  value?: Expression
  error?: ParseError
}

const { array, constant, constantFrom, integer, nat, oneof, tuple } = fc
const { fromCodePoint } = String

function code(char: string): number {
  const codePoint = char.codePointAt(0)
  if (codePoint === undefined) {
    throw new Error(`Invalid code point for "${char}"`)
  }
  return codePoint
}

const digitCode = integer({ min: code('0'), max: code('9') })
const upperCode = integer({ min: code('A'), max: code('Z') })
const lowerCode = integer({ min: code('a'), max: code('z') })
const underscoreCode = constant(code('_'))

function between(min: number, max: number) {
  return integer({ min, max })
}

describe<string, Output>((source) => parse(source), {
  empty: test(constant(undefined), () => ({
    given: '',
    expect: {
      error: {
        code: 'INVALID_EXPR',
        pos: { line: 1, col: 1 },
      },
    },
  })),
  newline: test(
    tuple(
      constant(code('\n')),
      array(constant(code('\t')), { minLength: 1 }),
    ).map(([first, rest]) => fromCodePoint(...[first, ...rest])),
    (value) => ({
      given: value,
      expect: {
        error: {
          code: 'INVALID_EXPR',
          pos: { line: 1, col: 1 },
        },
      },
    }),
  ),
  space: test(
    array(constantFrom(code('\t'), code(' ')), { minLength: 1 }).map((value) =>
      fromCodePoint(...value),
    ),
    (value) => ({
      given: value,
      expect: {
        error: {
          code: 'INVALID_EXPR',
          pos: { line: 1, col: 1 },
        },
      },
    }),
  ),
  punct: test(
    array(
      constantFrom(
        code('!'),
        code('%'),
        code('&'),
        code('*'),
        code('+'),
        code('-'),
        code('.'),
        code('/'),
        code(':'),
        code(';'),
        code('<'),
        code('='),
        code('>'),
        code('?'),
        code('@'),
        code('^'),
        code('|'),
        code('~'),
      ),
      { minLength: 1 },
    ).map((value) => fromCodePoint(...value)),
    (value) => ({
      given: value,
      expect: {
        value: {
          token: { kind: 'punct', value, pos: { line: 1, col: 1 } },
        },
      },
    }),
  ),
  alnum: test(
    tuple(
      oneof(upperCode, lowerCode, underscoreCode),
      array(oneof(digitCode, upperCode, lowerCode, underscoreCode)),
    ).map(([first, rest]) => fromCodePoint(...[first, ...rest])),
    (value) => ({
      given: value,
      expect: {
        value: {
          token: { kind: 'alnum', value, pos: { line: 1, col: 1 } },
        },
      },
    }),
  ),
  char: test(
    oneof(between(0, code("'") - 1), between(code("'") + 1, 127)).map(
      fromCodePoint,
    ),
    (value) => ({
      given: `'${value}'`,
      expect: {
        value: {
          token: { kind: 'char', value, pos: { line: 1, col: 1 } },
        },
      },
    }),
  ),
  int: test(nat(), (value) => ({
    given: `${value}`,
    expect: {
      value: {
        token: { kind: 'int', value, pos: { line: 1, col: 1 } },
      },
    },
  })),
  invalid: test(
    oneof(
      between(0, code('\t') - 1),
      between(code('\n') + 1, 31),
      constantFrom(
        code('"'),
        code('#'),
        code('$'),
        code('('),
        code(')'),
        code(','),
        code('['),
        code('\\'),
        code(']'),
        code('`'),
        code('{'),
        code('}'),
      ),
    ).map(fromCodePoint),
    (value) => ({
      given: value,
      expect: {
        error: {
          code: 'INVALID_TOKEN',
          pos: { line: 1, col: 1 },
        },
      },
    }),
  ),
})
