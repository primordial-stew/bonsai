import { test as vitest } from '@fast-check/vitest'
import type { Arbitrary } from 'fast-check'
import { expect } from 'vitest'

interface TestCase<I, O> {
  given: I
  expect: O
}

export function test<P, I, O>(
  props: Arbitrary<P>,
  spec: (params: P) => TestCase<I, O>,
) {
  return props.map(spec)
}

export default function <I, O>(
  action: (input: I) => O,
  cases: Record<string, Arbitrary<TestCase<I, O>>>,
) {
  for (const [name, props] of Object.entries(cases)) {
    vitest.prop([props])(name, (spec) => {
      expect(action(spec.given)).toEqual(spec.expect)
    })
  }
}
