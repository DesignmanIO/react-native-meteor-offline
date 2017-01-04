NullTransaction = require './NullTransaction'

class WriteTransaction extends NullTransaction
  constructor: (@db) ->
    @dirtyIds = {}
    @queued = false
    @traces = {}

  _ensureQueued: ->
    if @db.debug
      @traces[new Error().stack.split('\n').slice(1).join('\n')] = true

    if not @queued
      @queued = true
      process.nextTick => @_flush()

  upsert: (collectionName, result, docs) ->
    docs = [docs] if not Array.isArray(docs)
    @dirtyIds[collectionName] = @dirtyIds[collectionName] || {}
    docs.forEach (doc) =>
      @dirtyIds[collectionName][doc._id] = true
    @_ensureQueued()
    return result

  del: (collectionName, result, id) ->
    @dirtyIds[collectionName] = @dirtyIds[collectionName] || {}
    @dirtyIds[collectionName][id] = true
    @_ensureQueued()
    return result

  canPushTransaction: (transaction) -> true # nested writes would be bad, but impossible.

  _flush: ->
    ReadOnlyTransaction = require './ReadOnlyTransaction'

    changeRecords = {}
    for collectionName, ids of @dirtyIds
      documentFragments = []
      for id of ids
        version = @db.collections[collectionName].versions[id]
        documentFragments.push {_id: id, _version: version}
      changeRecords[collectionName] = documentFragments
    @dirtyIds = {}
    @queued = false

    @db.batchedUpdates =>
      @db.withTransaction new ReadOnlyTransaction(), =>
        if @db.debug
          traces = @traces
          @traces = {}
          prev_prepare = Error.prepareStackTrace
          Error.prepareStackTrace = (e) =>
            stack = e.stack
            for trace of traces
              stack += '\nFrom observed write:\n' + trace
            return stack

          try
            @db.emit 'change', changeRecords
          catch e
            @db.uncaughtExceptionHandler(e)
          finally
            Error.prepareStackTrace = prev_prepare

        else
          try
            @db.emit 'change', changeRecords
          catch e
            @db.uncaughtExceptionHandler(e)

module.exports = WriteTransaction
