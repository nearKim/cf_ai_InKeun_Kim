import { describe, it, expect } from 'vitest'
import {
  precondition,
  postcondition,
  invariant,
  assert,
  unreachable,
} from '../../../contracts'

describe('assertions', () => {
  describe('precondition', () => {
    it('should pass when condition is true', () => {
      expect(() => precondition(true, 'test')).not.toThrow()
    })

    it('should throw with correct message when condition is false', () => {
      expect(() => precondition(false, 'must be positive')).toThrow(
        'Precondition violated: must be positive'
      )
    })

    it('should narrow type after assertion', () => {
      const value: string | null = 'hello'
      precondition(value !== null, 'value must exist')
      const length: number = value.length
      expect(length).toBe(5)
    })
  })

  describe('postcondition', () => {
    it('should pass when condition is true', () => {
      expect(() => postcondition(true, 'test')).not.toThrow()
    })

    it('should throw with correct message when condition is false', () => {
      expect(() => postcondition(false, 'result must be valid')).toThrow(
        'Postcondition violated: result must be valid'
      )
    })
  })

  describe('invariant', () => {
    it('should pass when condition is true', () => {
      expect(() => invariant(true, 'test')).not.toThrow()
    })

    it('should throw with correct message when condition is false', () => {
      expect(() => invariant(false, 'state must be consistent')).toThrow(
        'Invariant violated: state must be consistent'
      )
    })
  })

  describe('assert', () => {
    it('should pass when condition is true', () => {
      expect(() => assert(true, 'test')).not.toThrow()
    })

    it('should throw with correct message when condition is false', () => {
      expect(() => assert(false, 'impossible state')).toThrow(
        'Assertion failed: impossible state'
      )
    })
  })

  describe('unreachable', () => {
    it('should always throw', () => {
      expect(() => unreachable('should never happen')).toThrow(
        'Unreachable code: should never happen'
      )
    })

    it('should return never type', () => {
      const exhaustiveCheck = (value: 'a' | 'b'): string => {
        switch (value) {
          case 'a':
            return 'A'
          case 'b':
            return 'B'
          default:
            return unreachable(`Unknown value: ${value}`)
        }
      }
      expect(exhaustiveCheck('a')).toBe('A')
    })
  })
})
