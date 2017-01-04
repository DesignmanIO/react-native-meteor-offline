var NullTransaction, WriteTransaction,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

NullTransaction = require('./NullTransaction');

WriteTransaction = (function(_super) {
  __extends(WriteTransaction, _super);

  function WriteTransaction(db) {
    this.db = db;
    this.dirtyIds = {};
    this.queued = false;
    this.traces = {};
  }

  WriteTransaction.prototype._ensureQueued = function() {
    if (this.db.debug) {
      this.traces[new Error().stack.split('\n').slice(1).join('\n')] = true;
    }
    if (!this.queued) {
      this.queued = true;
      return process.nextTick((function(_this) {
        return function() {
          return _this._flush();
        };
      })(this));
    }
  };

  WriteTransaction.prototype.upsert = function(collectionName, result, docs) {
    if (!Array.isArray(docs)) {
      docs = [docs];
    }
    this.dirtyIds[collectionName] = this.dirtyIds[collectionName] || {};
    docs.forEach((function(_this) {
      return function(doc) {
        return _this.dirtyIds[collectionName][doc._id] = true;
      };
    })(this));
    this._ensureQueued();
    return result;
  };

  WriteTransaction.prototype.del = function(collectionName, result, id) {
    this.dirtyIds[collectionName] = this.dirtyIds[collectionName] || {};
    this.dirtyIds[collectionName][id] = true;
    this._ensureQueued();
    return result;
  };

  WriteTransaction.prototype.canPushTransaction = function(transaction) {
    return true;
  };

  WriteTransaction.prototype._flush = function() {
    var ReadOnlyTransaction, changeRecords, collectionName, documentFragments, id, ids, version, _ref;
    ReadOnlyTransaction = require('./ReadOnlyTransaction');
    changeRecords = {};
    _ref = this.dirtyIds;
    for (collectionName in _ref) {
      ids = _ref[collectionName];
      documentFragments = [];
      for (id in ids) {
        version = this.db.collections[collectionName].versions[id];
        documentFragments.push({
          _id: id,
          _version: version
        });
      }
      changeRecords[collectionName] = documentFragments;
    }
    this.dirtyIds = {};
    this.queued = false;
    return this.db.batchedUpdates((function(_this) {
      return function() {
        return _this.db.withTransaction(new ReadOnlyTransaction(), function() {
          var e, prev_prepare, traces;
          if (_this.db.debug) {
            traces = _this.traces;
            _this.traces = {};
            prev_prepare = Error.prepareStackTrace;
            Error.prepareStackTrace = function(e) {
              var stack, trace;
              stack = e.stack;
              for (trace in traces) {
                stack += '\nFrom observed write:\n' + trace;
              }
              return stack;
            };
            try {
              return _this.db.emit('change', changeRecords);
            } catch (_error) {
              e = _error;
              return _this.db.uncaughtExceptionHandler(e);
            } finally {
              Error.prepareStackTrace = prev_prepare;
            }
          } else {
            try {
              return _this.db.emit('change', changeRecords);
            } catch (_error) {
              e = _error;
              return _this.db.uncaughtExceptionHandler(e);
            }
          }
        });
      };
    })(this));
  };

  return WriteTransaction;

})(NullTransaction);

module.exports = WriteTransaction;
