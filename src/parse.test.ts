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

const { constant, constantFrom, integer, nat, oneof, string, tuple } = fc

function textFrom(chars: string, minLength: number = 0) {
  return string({ unit: charFrom(chars), minLength })
}

function charFrom(chars: string) {
  return constantFrom(...chars)
}

function charOf(unit: string) {
  return string({ unit, minLength: 1, maxLength: 1 })
}

function charBetween(min: number, max: number) {
  return integer({ min, max }).map(String.fromCharCode)
}

function expr(kind: string, value: string | number, line: number, col: number) {
  return {
    value: { token: { kind, value, pos: { line, col } } },
  }
}

function error(code: string, line: number, col: number) {
  return {
    error: { code, pos: { line, col } },
  }
}

describe<string, Output>((source) => parse(source), {
  empty: test(constant(''), (value) => ({
    given: value,
    expect: error('invalid_expr', 1, 1),
  })),
  newline: test(
    textFrom('\t').map((value) => `\n${value}`),
    (value) => ({
      given: value,
      expect: error('invalid_expr', 1, 1),
    }),
  ),
  space: test(textFrom('\t ', 1), (value) => ({
    given: value,
    expect: error('invalid_expr', 1, 1),
  })),
  punct: test(textFrom('!%&*+--./:;<=>?@^|~', 1), (value) => ({
    given: value,
    expect: expr('punct', value, 1, 1),
  })),
  alnum: test(
    tuple(
      charFrom('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_'),
      textFrom(
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_0123456789',
      ),
    ).map(([first, rest]) => `${first}${rest}`),
    (value) => ({
      given: value,
      expect: expr('alnum', value, 1, 1),
    }),
  ),
  char: test(
    charOf('binary-ascii').filter((value) => value !== "'"),
    (value) => ({
      given: `'${value}'`,
      expect: expr('char', value, 1, 1),
    }),
  ),
  int: test(nat(), (value) => ({
    given: `${value}`,
    expect: expr('int', value, 1, 1),
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
    (value) => ({
      given: value,
      expect: error('invalid_token', 1, 1),
    }),
  ),
})
