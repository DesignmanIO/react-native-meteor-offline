NullTransaction = require './NullTransaction'
SynchronousWriteTransaction = require './SynchronousWriteTransaction'

class ReadTransaction extends NullTransaction
  constructor: ->
    @dirtyIds = {}
    @dirtyScans = {}
    @log = []

  _extractFragment: (doc) ->
    if not doc
      return null

    return {
      _id: doc._id,
      _version: doc._version,
    }

  get: (collectionName, result, _id) ->
    @dirtyIds[collectionName] = @dirtyIds[collectionName] || {}
    @dirtyIds[collectionName][_id] = true
    @log.push @_extractFragment(result)
    return result

  find: (collectionName, result) ->
    @dirtyScans[collectionName] = true
    @log.push result.map(@_extractFragment)
    return result

  findOne: (collectionName, result) ->
    @dirtyScans[collectionName] = true
    @log.push @_extractFragment(result)
    return result

  canPushTransaction: (transaction) -> transaction instanceof SynchronousWriteTransaction

module.exports = ReadTransaction
