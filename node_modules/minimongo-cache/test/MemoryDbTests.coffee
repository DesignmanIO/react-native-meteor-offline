chai = require 'chai'
assert = chai.assert
MemoryDb = require "../lib/MemoryDb"
db_queries = require "./db_queries"
_ = require 'lodash'

describe 'MemoryDb', ->
  before (done) ->
    @reset = (done) =>
      @db = new MemoryDb(true)
      @db.addCollection("scratch")
      @col = @db.scratch
      done()
    @reset(done)

  describe "passes queries", ->
    db_queries.call(this)
