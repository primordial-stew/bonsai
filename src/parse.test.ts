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

function atom() {
  return oneof(alnum(), nonQuoteChar(), int())
}

function alnum() {
  return tuple(
    charFrom('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_'),
    textFrom('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_0123456789'),
  )
    .map(([first, rest]) => `${first}${rest}`)
    .map((value) => ({ kind: 'alnum', text: value, value }))
}

function nonQuoteChar() {
  return charOf('binary-ascii')
    .filter((value) => value !== "'")
    .map((value) => ({ kind: 'char', text: `'${value}'`, value }))
}

function int() {
  return nat().map((value) => ({ kind: 'int', text: `${value}`, value }))
}

function space() {
  return textFrom('\t ', 1)
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
  empty: test(constant(''), (text) => ({
    given: text,
    expect: error('invalid_expr', 1, 1),
  })),
  newline: test(
    textFrom('\t').map((indent) => `\n${indent}`),
    (text) => ({
      given: text,
      expect: error('invalid_expr', 1, 1),
    }),
  ),
  punct: test(textFrom('!%&*+--./:;<=>?@^|~', 1), (value) => ({
    given: value,
    expect: expr('punct', value, 1, 1),
  })),
  alnum: test(alnum(), ({ text, value }) => ({
    given: text,
    expect: expr('alnum', value, 1, 1),
  })),
  char: test(nonQuoteChar(), ({ text, value }) => ({
    given: text,
    expect: expr('char', value, 1, 1),
  })),
  int: test(int(), ({ text, value }) => ({
    given: text,
    expect: expr('int', value, 1, 1),
  })),
  space: test(space(), (text) => ({
    given: text,
    expect: error('invalid_expr', 1, 1),
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
  atom_space: test(
    tuple(atom(), space()),
    ([{ kind, text, value }, space]) => ({
      given: `${text}${space}`,
      expect: expr(kind, value, 1, 1),
    }),
  ),
})
