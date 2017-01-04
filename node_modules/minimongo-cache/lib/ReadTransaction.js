var NullTransaction, ReadTransaction, SynchronousWriteTransaction,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

NullTransaction = require('./NullTransaction');

SynchronousWriteTransaction = require('./SynchronousWriteTransaction');

ReadTransaction = (function(_super) {
  __extends(ReadTransaction, _super);

  function ReadTransaction() {
    this.dirtyIds = {};
    this.dirtyScans = {};
    this.log = [];
  }

  ReadTransaction.prototype._extractFragment = function(doc) {
    if (!doc) {
      return null;
    }
    return {
      _id: doc._id,
      _version: doc._version
    };
  };

  ReadTransaction.prototype.get = function(collectionName, result, _id) {
    this.dirtyIds[collectionName] = this.dirtyIds[collectionName] || {};
    this.dirtyIds[collectionName][_id] = true;
    this.log.push(this._extractFragment(result));
    return result;
  };

  ReadTransaction.prototype.find = function(collectionName, result) {
    this.dirtyScans[collectionName] = true;
    this.log.push(result.map(this._extractFragment));
    return result;
  };

  ReadTransaction.prototype.findOne = function(collectionName, result) {
    this.dirtyScans[collectionName] = true;
    this.log.push(this._extractFragment(result));
    return result;
  };

  ReadTransaction.prototype.canPushTransaction = function(transaction) {
    return transaction instanceof SynchronousWriteTransaction;
  };

  return ReadTransaction;

})(NullTransaction);

module.exports = ReadTransaction;
