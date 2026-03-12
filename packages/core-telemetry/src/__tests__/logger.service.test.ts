import { beforeEach, describe, expect, it } from 'vitest'
import { LoggerService } from '../logger.service.js'

describe('LoggerService', () => {
  let logger: LoggerService

  beforeEach(() => {
    logger = new LoggerService('test-service')
  })

  it('creates a logger instance', () => {
    expect(logger).toBeDefined()
  })

  describe('NestJS LoggerService interface', () => {
    it('log does not throw', () => {
      expect(() => logger.log('test message')).not.toThrow()
    })

    it('error does not throw', () => {
      expect(() => logger.error('test error')).not.toThrow()
    })

    it('warn does not throw', () => {
      expect(() => logger.warn('test warning')).not.toThrow()
    })

    it('debug does not throw', () => {
      expect(() => logger.debug('test debug')).not.toThrow()
    })

    it('verbose does not throw', () => {
      expect(() => logger.verbose('test verbose')).not.toThrow()
    })

    it('accepts context string as second param (NestJS convention)', () => {
      expect(() => logger.log('message', 'MyController')).not.toThrow()
    })

    it('accepts object as second param', () => {
      expect(() => logger.log('message', { key: 'value' })).not.toThrow()
    })
  })

  describe('getPino', () => {
    it('returns the underlying pino instance', () => {
      const pino = logger.getPino()
      expect(pino).toBeDefined()
      expect(typeof pino.info).toBe('function')
      expect(typeof pino.error).toBe('function')
    })
  })
})
