var NullTransaction,
  __slice = [].slice;

NullTransaction = (function() {
  function NullTransaction() {}

  NullTransaction.prototype.get = function() {
    var args, collectionName, result;
    collectionName = arguments[0], result = arguments[1], args = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
    return result;
  };

  NullTransaction.prototype.find = function() {
    var args, collectionName, result;
    collectionName = arguments[0], result = arguments[1], args = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
    return result;
  };

  NullTransaction.prototype.findOne = function() {
    var args, collectionName, result;
    collectionName = arguments[0], result = arguments[1], args = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
    return result;
  };

  NullTransaction.prototype.upsert = function() {
    var args, collectionName, result;
    collectionName = arguments[0], result = arguments[1], args = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
    throw new Error('Cannot write outside of a WriteTransaction');
  };

  NullTransaction.prototype.del = function() {
    var args, collectionName, result;
    collectionName = arguments[0], result = arguments[1], args = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
    throw new Error('Cannot write outside of a WriteTransaction');
  };

  NullTransaction.prototype.canPushTransaction = function(transaction) {
    return true;
  };

  return NullTransaction;

})();

module.exports = NullTransaction;
