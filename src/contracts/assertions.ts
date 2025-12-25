export function precondition(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Precondition violated: ${message}`)
  }
}

export function postcondition(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Postcondition violated: ${message}`)
  }
}

export function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invariant violated: ${message}`)
  }
}

export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

export function unreachable(message: string): never {
  throw new Error(`Unreachable code: ${message}`)
}
