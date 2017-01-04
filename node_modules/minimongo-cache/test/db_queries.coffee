MemoryDb = require "../lib/MemoryDb"
_ = require 'lodash'
chai = require 'chai'
assert = chai.assert

error = (err) ->
  console.log err
  assert.fail(JSON.stringify(err))

# Runs queries on @col which must be a collection (with a:<string>, b:<integer>, c:<json>, geo:<geojson>, stringarr: <json array of strings>)
# When present:
# c.arrstr is an array of string values
# c.arrint is an array of integer values
# @reset(done) must truncate the collection
module.exports = ->
  before ->
    # Test a filter to return specified rows (in order)
    @testFilter = (filter, ids, done) ->
      results = @col.find(filter, { sort:["_id"]})
      assert.deepEqual _.pluck(results, '_id'), ids
      done()

  context 'With sample rows', ->
    beforeEach (done) ->
      @reset =>
        @col.upsert { _id:"1", a:"Alice", b:1, c: { d: 1, e: 2 } }
        @col.upsert { _id:"2", a:"Charlie", b:2, c: { d: 2, e: 3 } }
        @col.upsert { _id:"3", a:"Bob", b:3 }
        process.nextTick => done()

    it 'finds all rows', (done) ->
      results = @col.find({})
      assert.equal results.length, 3
      done()

    it 'finds all rows with options', (done) ->
      results = @col.find({}, {})
      assert.equal 3, results.length
      done()

    it 'filters by id', (done) ->
      @testFilter { _id: "1" }, ["1"], done

    it 'filters by string', (done) ->
      @testFilter { a: "Alice" }, ["1"], done

    it 'filters by $in string', (done) ->
      @testFilter { a: { $in: ["Alice", "Charlie"]} }, ["1", "2"], done

    it 'filters by number', (done) ->
      @testFilter { b: 2 }, ["2"], done

    it 'filters by $in number', (done) ->
      @testFilter { b: { $in: [2, 3]} }, ["2", "3"], done

    it 'filters by $regex', (done) ->
      @testFilter { a: { $regex: "li"} }, ["1", "2"], done

    it 'filters by $regex case-sensitive', (done) ->
      @testFilter { a: { $regex: "A"} }, ["1"], done

    it 'filters by $regex case-insensitive', (done) ->
      @testFilter { a: { $regex: "A", $options: 'i' } }, ["1", "2"], done

    it 'filters by $or', (done) ->
      @testFilter { "$or": [{b:1}, {b:2}]}, ["1","2"], done

    it 'filters by path', (done) ->
      @testFilter { "c.d": 2 }, ["2"], done

    it 'filters by $ne', (done) ->
      @testFilter { "b": { $ne: 2 }}, ["1","3"], done

    it 'filters by $gt', (done) ->
      @testFilter { "b": { $gt: 1 }}, ["2","3"], done

    it 'filters by $lt', (done) ->
      @testFilter { "b": { $lt: 3 }}, ["1","2"], done

    it 'filters by $gte', (done) ->
      @testFilter { "b": { $gte: 2 }}, ["2","3"], done

    it 'filters by $lte', (done) ->
      @testFilter { "b": { $lte: 2 }}, ["1","2"], done

    it 'filters by $not', (done) ->
      @testFilter { "b": { $not: { $lt: 3 }}}, ["3"], done

    it 'filters by $or', (done) ->
      @testFilter { $or: [{b: 3},{b: 1}]}, ["1", "3"], done

    it 'filters by $exists: true', (done) ->
      @testFilter { c: { $exists: true }}, ["1", "2"], done

    it 'filters by $exists: false', (done) ->
      @testFilter { c: { $exists: false }}, ["3"], done

    it 'includes fields', (done) ->
      results = @col.find({ _id: "1" }, { fields: { a:1 }})
      assert.deepEqual results[0], { _id: "1",  a: "Alice" }
      done()

    it 'includes subfields', (done) ->
      results = @col.find({ _id: "1" }, { fields: { "c.d":1 }})
      assert.deepEqual results[0], { _id: "1",  c: { d: 1 } }
      done()

    it 'ignores non-existent subfields', (done) ->
      results = @col.find({ _id: "1" }, { fields: { "x.y":1 }})
      assert.deepEqual results[0], { _id: "1" }
      done()

    it 'excludes fields', (done) ->
      results = @col.find({ _id: "1" }, { fields: { a:0 }})
      assert.isUndefined results[0].a
      assert.equal results[0].b, 1
      done()

    it 'excludes subfields', (done) ->
      results = @col.find({ _id: "1" }, { fields: { "c.d": 0 }})
      assert.deepEqual results[0].c, { e: 2 }
      done()

    it 'can get', (done) ->
      result = @col.get '2'
      assert.equal 'Charlie', result.a
      done()

    it 'can get missing', (done) ->
      result = @col.get '999', 'honker burger'
      assert.equal 'honker burger', result
      done()

    it 'finds one row', (done) ->
      result = @col.findOne { _id: "2" }
      assert.equal 'Charlie', result.a
      done()

    it 'emits events', (done) ->
      events = []
      @db.on 'change', (changeRecords) ->
        events.push changeRecords
      @col.upsert {_id: 1, name: 'x'}
      assert.deepEqual events, []

      process.nextTick =>
        assert.deepEqual events, [{scratch: [{_id: '1', _version: 2}]}]

        events.length = 0

        @col.upsert {_id: 1, name: 'y'}
        @col.del 1

        assert.deepEqual events, []
        process.nextTick ->
          assert.deepEqual events, [{scratch: [{_id: '1', _version: 4}]}]
          done()

    it 'supports observable queries', (done) ->
      subscribeEvents = []
      queryEvents = 0
      getQueryEvents = 0

      q = @db.observe =>
        queryEvents++
        return @db.scratch.find({_id: '1'})

      q.subscribe (result) -> subscribeEvents.push(result)

      q2 = @db.observe =>
        getQueryEvents++
        return @db.scratch.get(1)
      q2.subscribe () -> null

      assert.deepEqual subscribeEvents, [[{ _id:"1", _version:1, a:"Alice", b:1, c: { d: 1, e: 2 } }]]
      assert.equal queryEvents, 1
      assert.equal getQueryEvents, 1

      subscribeEvents.length = 0;
      queryEvents = 0
      getQueryEvents = 0

      @col.upsert({_id: "1", a: "Bob", b: null, c: null})

      process.nextTick =>
        assert.deepEqual subscribeEvents, [[{ _id:"1", _version:2, a:"Bob", b: null, c: null}]]
        assert.equal queryEvents, 1
        assert.equal getQueryEvents, 1

        subscribeEvents.length = 0;
        queryEvents = 0
        getQueryEvents = 0

        # Updating a collection should not trigger get() updates or re-renders
        @col.upsert({_id: '2', a: 'Jimbo'})
        process.nextTick =>
          assert.deepEqual subscribeEvents, []
          assert.equal queryEvents, 1
          assert.equal getQueryEvents, 0

          done()

    it 'supports server queries', (done) ->
      col = @col
      db = @db

      logs = []

      @col.upsert _id: 'foo', name: 'x', age: 99

      serverQuery = @db.createServerQuery
        statics:
          getKey: (props) -> props.name
        query: () ->
          logs.push 'query() ' + JSON.stringify(@state)
          col.find {a: @props.name}
        getInitialState: () -> name: ''
        queryDidMount: () ->
          @setState name: 'pete'
          logs.push 'didMount'
        queryDidUpdate: (prevProps) ->
          logs.push 'didUpdateProps ' + JSON.stringify(@props) + ', ' + JSON.stringify(prevProps)

      sub = @db.observe => serverQuery(name: 'x')
      sub.subscribe (result) -> logs.push 'result ' + JSON.stringify(result)
      serverQuery.getInstance(name: 'x').setState(name: 'next')
      process.nextTick ->
        assert.deepEqual logs, [
          "didMount",
          'query() {"name":"pete"}',
          "result []",
          'didUpdateProps {"name":"x"}, {"name":"x"}',
          'query() {"name":"next"}',
          'result []'
        ]

        done()

    it 'does not remount server queries', (done) ->
      num_mounts = 0
      serverQuery = @db.createServerQuery
        statics:
          getKey: (props) -> props.a
        query: ->
        queryDidMount: -> num_mounts += 1
      serverQuery(a: 'x', b: 'y')
      serverQuery(a: 'x', b: 'z')
      assert.equal num_mounts, 1
      serverQuery(a: 'y', b: 'z')
      done()

    it 'synchronously sets state', (done) ->
      num_queries = 0
      serverQuery = @db.createServerQuery
        statics:
          getKey: -> 'x'
        query: -> num_queries += 1
        queryDidMount: -> @setState({})
      serverQuery(a: 'x', b: 'y')
      assert.equal num_queries, 1
      done()

    it 'asynchronously sets state', (done) ->
      num_queries = 0
      serverQuery = @db.createServerQuery
        statics:
          getKey: -> 'x'
        query: -> num_queries += 1
      @db.observe(-> serverQuery(a: 'x', b: 'y')).subscribe (x) ->
      assert.equal num_queries, 1
      serverQuery.getInstance({a: 'x'}).setState({})
      process.nextTick ->
        assert.equal num_queries, 2
        done()

    it 'serializes and deseralizes', (done) ->
      serialized = @db.serialize()
      deserialized = MemoryDb.deserialize serialized
      assert.deepEqual @col.find(), deserialized.scratch.find()
      assert.deepEqual serialized, deserialized.serialize()
      done()

    it 'does not allow cascading writes', (done) ->
      @db.on 'change', (changeRecords) =>
        thrown_exception = null
        try
          @col.upsert {_id: 2, name: 'y'}
        catch e
          thrown_exception = e
        assert thrown_exception
        done()

      @col.upsert {_id: 1, name: 'x'}

    it 'supports long stack traces', (done) ->
      if navigator.userAgent.toLowerCase().indexOf('chrome') == -1
        done()
        return

      captured_stack = null
      @db.on 'change', (changeRecords) ->
        captured_stack = new Error('ouch').stack

      @col.upsert {_id: 1, name: 'x'}
      process.nextTick =>
        assert captured_stack.indexOf('upsert') > -1
        done()

    it 'dels item', (done) ->
      @col.del "2"
      results = @col.find({})
      assert.equal 2, results.length
      assert "1" in (result._id for result in results)
      assert "2" not in (result._id for result in results)
      done()

    it 'removes items', (done) ->
      @col.remove {_id: '2'}
      results = @col.find({})
      assert.equal 2, results.length
      assert "1" in (result._id for result in results)
      assert "2" not in (result._id for result in results)
      done()

    it 'dels non-existent item', (done) ->
      @col.del "999"
      results = @col.find({})
      assert.equal 3, results.length
      done()

    it 'sorts ascending', (done) ->
      results = @col.find({}, {sort: ['a']})
      assert.deepEqual _.pluck(results, '_id'), ["1","3","2"]
      done()

    it 'sorts descending', (done) ->
      results = @col.find({}, {sort: [['a','desc']]})
      assert.deepEqual _.pluck(results, '_id'), ["2","3","1"]
      done()

    it 'limits', (done) ->
      results = @col.find({}, {sort: ['a'], limit:2})
      assert.deepEqual _.pluck(results, '_id'), ["1","3"]
      done()

    it 'skips', (done) ->
      results = @col.find({}, {sort: ['a'], skip:2})
      assert.deepEqual _.pluck(results, '_id'), ["2"]
      done()

    it 'shares memory for identical instances', (done) ->
      result1 = @col.findOne { _id: "2" }
      result2 = @col.findOne { _id: "2" }
      assert result1 is result2
      done()

    it 'does not share memory for different instances', (done) ->
      result1 = @col.findOne { _id: "2" }
      @col.upsert {_id: "2", a: "1" }
      result2 = @col.findOne { _id: "2" }
      assert not (result1 is result2)
      done()

    it 'returns array if called with array', (done) ->
      items = @col.upsert [{ _id: 1, a: "1" }]
      assert.equal items[0].a, "1"
      done()

    it 'updates by id', (done) ->
      item = @col.upsert { _id:"1", a:"1" }
      item = @col.upsert { _id:"1", a:"2", b: 1 }
      assert.equal item.a, "2"

      results = @col.find({ _id: "1" })
      assert.equal 1, results.length, "Should be only one document"
      done()

    it 'call upsert with upserted row', (done) ->
      item = @col.upsert { _id:"1", a:"1" }
      assert.equal item._id, "1"
      assert.equal item.a, "1"
      done()

  it 'upserts multiple rows', (done) ->
    @timeout(10000)
    @reset =>
      docs = []
      for i in [0...100]
        docs.push { _id: i, b: i }

      @col.upsert docs
      results = @col.find({})
      assert.equal results.length, 100
      done()

  context 'With sample with capitalization', ->
    beforeEach (done) ->
      @reset =>
        @col.upsert { _id:"1", a:"Alice", b:1, c: { d: 1, e: 2 } }
        @col.upsert { _id:"2", a:"AZ", b:2, c: { d: 2, e: 3 } }
        done()

    it 'finds sorts in Javascript order', (done) ->
      results = @col.find({}, {sort: ['a']})
      assert.deepEqual _.pluck(results, '_id'), ["2","1"]
      done()

  context 'With integer array in json rows', ->
    beforeEach (done) ->
      @reset =>
        @col.upsert { _id:"1", c: { arrint: [1, 2] }}
        @col.upsert { _id:"2", c: { arrint: [2, 3] }}
        @col.upsert { _id:"3", c: { arrint: [1, 3] }}
        done()

    it 'filters by $in', (done) ->
      @testFilter { "c.arrint": { $in: [3] }}, ["2", "3"], done

    it 'filters by list $in with multiple', (done) ->
      @testFilter { "c.arrint": { $in: [1, 3] }}, ["1", "2", "3"], done

  context 'With object array rows', ->
    beforeEach (done) ->
      @reset =>
        @col.upsert { _id:"1", c: [{ x: 1, y: 1 }, { x:1, y:2 }] }
        @col.upsert { _id:"2", c: [{ x: 2, y: 1 }] }
        @col.upsert { _id:"3", c: [{ x: 2, y: 2 }] }
        done()

    it 'filters by $elemMatch', (done) ->
      @testFilter { "c": { $elemMatch: { y:1 }}}, ["1", "2"], =>
        @testFilter { "c": { $elemMatch: { x:1 }}}, ["1"], done

  context 'With array rows with inner string arrays', ->
    beforeEach (done) ->
      @reset =>
        @col.upsert { _id:"1", c: [{ arrstr: ["a", "b"]}, { arrstr: ["b", "c"]}] }
        @col.upsert { _id:"2", c: [{ arrstr: ["b"]}] }
        @col.upsert { _id:"3", c: [{ arrstr: ["c", "d"]}, { arrstr: ["e", "f"]}] }
        done()

    it 'filters by $elemMatch', (done) ->
      @testFilter { "c": { $elemMatch: { "arrstr": { $in: ["b"]} }}}, ["1", "2"], =>
        @testFilter { "c": { $elemMatch: { "arrstr": { $in: ["d", "e"]} }}}, ["3"], done

  context 'With text array rows', ->
    beforeEach (done) ->
      @reset =>
        @col.upsert { _id:"1", textarr: ["a", "b"]}
        @col.upsert { _id:"2", textarr: ["b", "c"]}
        @col.upsert { _id:"3", textarr: ["c", "d"]}
        done()

    it 'filters by $in', (done) ->
      @testFilter { "textarr": { $in: ["b"] }}, ["1", "2"], done

    it 'filters by direct reference', (done) ->
      @testFilter { "textarr": "b" }, ["1", "2"], done

    it 'filters by both item and complete array', (done) ->
      @testFilter { "textarr": { $in: ["a", ["b", "c"]] } }, ["1", "2"], done

  geopoint = (lng, lat) ->
    return {
      type: 'Point'
      coordinates: [lng, lat]
    }

  context 'With geolocated rows', ->
    beforeEach (done) ->
      @col.upsert { _id:"1", geo:geopoint(90, 45) }
      @col.upsert { _id:"2", geo:geopoint(90, 46) }
      @col.upsert { _id:"3", geo:geopoint(91, 45) }
      @col.upsert { _id:"4", geo:geopoint(91, 46) }
      done()

    it 'finds points near', (done) ->
      selector = geo:
        $near:
          $geometry: geopoint(90, 45)

      results = @col.find(selector)
      assert.deepEqual _.pluck(results, '_id'), ["1","3","2","4"]
      done()

    it 'finds points near maxDistance', (done) ->
      selector = geo:
        $near:
          $geometry: geopoint(90, 45)
          $maxDistance: 111180

      results = @col.find(selector)
      assert.deepEqual _.pluck(results, '_id'), ["1","3"]
      done()

    it 'finds points near maxDistance just above', (done) ->
      selector = geo:
        $near:
          $geometry: geopoint(90, 45)
          $maxDistance: 111410

      results = @col.find(selector)
      assert.deepEqual _.pluck(results, '_id'), ["1","3","2"]
      done()

    it 'finds points within simple box', (done) ->
      selector = geo:
        $geoIntersects:
          $geometry:
            type: 'Polygon'
            coordinates: [[
              [89.5, 45.5], [89.5, 46.5], [90.5, 46.5], [90.5, 45.5], [89.5, 45.5]
            ]]
      results = @col.find(selector)
      assert.deepEqual _.pluck(results, '_id'), ["2"]
      done()

    it 'finds points within big box', (done) ->
      selector = geo:
        $geoIntersects:
          $geometry:
            type: 'Polygon'
            coordinates: [[
              [0, -89], [0, 89], [179, 89], [179, -89], [0, -89]
            ]]
      results = @col.find(selector, {sort:['_id']})
      assert.deepEqual _.pluck(results, '_id'), ["1", "2", "3", "4"]
      done()

    it 'handles undefined', (done) ->
      selector = geo:
        $geoIntersects:
          $geometry:
            type: 'Polygon'
            coordinates: [[
              [89.5, 45.5], [89.5, 46.5], [90.5, 46.5], [90.5, 45.5], [89.5, 45.5]
            ]]
      @col.upsert { _id:5 }
      results = @col.find(selector)
      assert.deepEqual _.pluck(results, '_id'), ["2"]
      done()
