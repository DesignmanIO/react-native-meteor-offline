'use strict';

var _ = require('lodash');

function cannotRead() {
  throw new Error('Cannot read in a SynchronousWriteTransaction');
}

function SynchronousWriteTransaction() {}

_.mixin(SynchronousWriteTransaction.prototype, {
  get: cannotRead,
  find: cannotRead,
  findOne: cannotRead,
  upsert: function upsert(_, result) {
    return result;
  },
  del: function del(_, result) {
    return result;
  },
  canPushTransaction: function canPushTransaction() {
    return false;
  }
});

module.exports = SynchronousWriteTransaction;