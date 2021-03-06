const Lab = require('lab')
const assert = require('power-assert')
const request = require('request-promise')
const startServer = require('../lib/server')
const utils = require('./utils')

const lab = exports.lab = Lab.script()
const {describe, it, before, beforeEach, after, afterEach} = lab

const services = [{
  name: 'sample',
  init: require('./fixtures/sample')
}]

describe('service\'s server', () => {

  let started

  before(utils.shutdownLogger)

  after(utils.restoreLogger)

  afterEach(() => {
    if (!started) return Promise.resolve()
    return started.stop()
  })

  it('should start with default port', () =>
    startServer()
      .then(server => server.stop())
  )

  it('should handle configuration error', done => {
    assert.throws(() => startServer({port: -1}), Error)
    done()
  })

  it('should handle start error', () => {
    let first
    // given a started server
    return startServer()
      .then(server => {
        first = server
      })
      // when starting another server on the same port
      .then(() => startServer({port: first.info.port}))
      .then(second => {
        first.stop()
        second.stop()
        assert.fail('', '', 'server shouldn\'t have start')
      }, err => {
        first.stop()
        assert(err instanceof Error)
        assert(err.message.indexOf('EADDRINUSE') >= 0)
      })
  })

  it('should list exposed APIs', () =>
    startServer({services})
      .then(server =>
        request({
          method: 'GET',
          url: `${server.info.uri}/api/exposed`,
          json: true
        }).then(exposed => {
          assert.deepEqual(exposed, [{
            name: 'sample', id: 'ping', path: '/api/sample/ping', params: []
          }, {
            name: 'sample', id: 'greeting', path: '/api/sample/greeting', params: ['name']
          }, {
            name: 'sample', id: 'failing', path: '/api/sample/failing', params: []
          }])
        }).then(() => server.stop())
          .catch(err => {
            server.stop()
            throw err
          })
      )
  )

  describe('server with an ordered list of services', () => {
    const initOrder = []
    const orderedServices = Array.from({length: 3}).map((v, i) => ({
      name: `service-${i}`,
      init: opts => new Promise((resolve, reject) => {
        if (opts.fail) return reject(new Error(`service ${i} failed to initialize`))
        initOrder.push(i)
        return resolve()
      })
    }))

    beforeEach(done => {
      initOrder.splice(0, initOrder.length)
      done()
    })

    it('should keep order when registering locally', () =>
      startServer({services: orderedServices})
        .then(server => {
          server.stop()
          assert.deepEqual(initOrder, [0, 1, 2])
        })
    )

    it('should not stop initialisation at first error', () =>
      startServer({
        services: orderedServices,
        serviceOpts: {
          'service-1': {fail: true}
        }
      })
        .then(server => {
          server.stop()
          assert.fail('', '', 'server shouln\'t have start')
        }, err => {
          assert(err instanceof Error)
          assert.notEqual(err.message.indexOf('service 1 failed to initialize'), -1)
          assert.deepEqual(initOrder, [0])
        })
    )
  })
})
