export interface Expression {
  token: Token
  lhs?: Expression
  rhs?: Expression
}

interface Handler {
  rank?: number
  regexp?: string
  tokenize?: (tokenizer: Tokenizer, kind: string, text: string) => void
  evaluate?: (text: string) => string | number
  parse?: (parser: Parser, token: Token, next?: Token) => ParseError | void
}

interface Parser {
  stack: Array<Token>
  exprs: Array<Expression>
}

interface Tokenizer {
  tokens: Array<Token>
  newline?: {
    value: number
    pos: Position
  }
  indent: number
  pos: Position
}

interface Token {
  kind: string
  value?: string | number
  pos: Position
}

interface Position {
  line: number
  col: number
}

interface ParseError {
  code: string
  pos: Position
}

const handlers: Record<string, Handler> = {
  indent: {
    rank: 3,
    parse({ stack }, token) {
      stack.push(token)
    },
  },
  dedent: {
    rank: 3,
    parse(parser, token) {
      const { stack } = parser
      const { value, pos } = token
      if (typeof value !== 'number') {
        throw new Error(`Invalid dedent token at "${JSON.stringify(pos)}"`)
      }
      for (let i = 0; i < value; i++) {
        reduce(parser, 'dedent')
        const token = stack.pop()
        if (!token || token.kind !== 'indent') {
          return { code: 'MISMATCHED_INDENT', pos }
        }
      }
    },
  },
  newline: {
    rank: 2,
    regexp: '\\n\\t*',
    tokenize(tokenizer, _kind, text) {
      const { tokens, newline, pos } = tokenizer
      const value = text.length
      if (tokens.length > 0) {
        if (newline) {
          newline.value = value
        } else {
          tokenizer.newline = { value, pos: { ...pos } }
        }
      }
      pos.line++
      pos.col = value
    },
    parse(parser, token) {
      const { stack } = parser
      reduce(parser, token.kind)
      stack.push(token)
    },
  },
  punct: {
    rank: 1,
    regexp: "[!%&*+,\\-./:;<=>?@^|~]+",
    evaluate: (text) => text,
    parse(parser, token) {
      const { stack } = parser
      reduce(parser, token.kind)
      stack.push(token)
    },
  },
  alnum: {
    rank: 0,
    regexp: '[A-Za-z_][A-Za-z0-9_]*',
    evaluate: (text) => text,
    parse({ stack, exprs }, token, next) {
      if (next?.kind === 'alnum') {
        stack.push(token)
      } else {
        exprs.push({ token })
      }
    },
  },
  char: {
    regexp: "'[^']'",
    evaluate: (text) => text.slice(1, text.length - 1),
  },
  int: {
    regexp: '[0-9]+',
    evaluate: parseInt,
  },
  space: {
    regexp: '[\\t ]+',
    tokenize({ pos }, _kind, text) {
      pos.col += text.length
    },
  },
}

const lexer = new RegExp(
  Object.entries(handlers)
    .filter(([_name, { regexp }]) => regexp !== undefined)
    .map(([name, { regexp }]) => `(?<${name}>${regexp})`)
    .join('|'),
  'y',
)

function tokenizeDefault(tokenizer: Tokenizer, kind: string, text: string) {
  const { tokens, newline, indent, pos } = tokenizer
  if (newline) {
    let kind: string
    let value: number | undefined = indent - newline.value
    if (value > 0) {
      kind = 'dedent'
    } else if (value < 0) {
      kind = 'indent'
      value = undefined
    } else {
      kind = 'newline'
      value = undefined
    }
    tokens.push({
      kind,
      value,
      pos: newline.pos,
    })
    // inject synthetic newline token after dedent
    if (kind == 'dedent') {
      tokens.push({
        kind: 'newline',
        pos: newline.pos,
      })
    }
    tokenizer.newline = undefined
    tokenizer.indent = newline.value
  }
  const evaluate = handlers[kind].evaluate
  if (!evaluate) {
    throw new Error(`Invalid handler "${kind}"`)
  }
  tokens.push({
    kind,
    value: evaluate(text),
    pos: { ...pos },
  })
  pos.col += text.length
}

function parseDefault({ exprs }: Parser, token: Token) {
  exprs.push({ token })
}

function reduce({ stack,  exprs }: Parser, kind: string) {
  while (stack.length > 0) {
    const token = stack.at(-1)
    if (!token || rank(kind) <= rank(token.kind)) {
      break
    }
    stack.pop()
    const rhs = exprs.pop()
    exprs.push({ token, lhs: exprs.pop(), rhs })
  }
}

function rank(kind: string) {
  const rank = handlers[kind].rank
  if (rank === undefined) {
    throw new Error(`Invalid rank for token kind "${kind}"`)
  }
  return rank
}

export default function (source: string) {
  const tokens: Array<Token> = []
  const pos = { line: 1, col: 1 }
  const tokenizer: Tokenizer = { tokens, newline: undefined, indent: 1, pos }

  lexer.lastIndex = 0
  while (lexer.lastIndex < source.length) {
    const match = lexer.exec(source)
    if (!match) {
      return { error: { code: 'INVALID_TOKEN', pos } }
    }
    if (!match.groups) {
      throw new Error(`Invalid regex match "${JSON.stringify(match)}"`)
    }
    const groups = Object.entries(match.groups).filter(
      ([_kind, text]) => text !== undefined,
    )
    const [kind, text] = groups[0]
    const tokenize = handlers[kind].tokenize || tokenizeDefault
    tokenize(tokenizer, kind, text)
  }

  // inject synthetic dedent token at end of file
  const { newline, indent } = tokenizer
  if (indent > 1) {
    tokens.push({
      kind: 'dedent',
      value: indent - 1,
      pos: newline ? newline.pos : tokenizer.pos,
    })
  }

  const stack: Array<Token> = []
  const exprs: Array<Expression> = []
  const parser: Parser = { stack, exprs }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const parse = handlers[token.kind].parse || parseDefault
    const error = parse(parser, token, tokens[i + 1])
    if (error) {
      return { error }
    }
  }

  reduce(parser, 'dedent')

  if (exprs.length !== 1) {
    return { error: { code: 'INVALID_EXPR', pos } }
  }

  return { value: exprs[0] }
}
