/////////////////////////////////////////////////////
// Package docs at http://docs.meteor.com/#tracker //
// Last merge: https://github.com/meteor/meteor/blob/696876b1848e4d6a920143422c2c50c4501c85a3/packages/tracker/tracker.js //
/////////////////////////////////////////////////////

//
module.exports = (function() {

// check for global and use that one instead of loading a new one
if (typeof global.Trackr !== "undefined") {
	return global.Trackr;
}

/**
 * @namespace Trackr
 * @summary The namespace for Trackr-related methods.
 */
var Trackr = global.Trackr = {};

// http://docs.meteor.com/#tracker_active

/**
 * @summary True if there is a current computation, meaning that dependencies on reactive data sources will be tracked and potentially cause the current computation to be rerun.
 * @locus Client
 * @type {Boolean}
 */
Trackr.active = false;

// http://docs.meteor.com/#tracker_currentcomputation

/**
 * @summary The current computation, or `null` if there isn't one.	The current computation is the [`Trackr.Computation`](#tracker_computation) object created by the innermost active call to `Trackr.autorun`, and it's the computation that gains dependencies when reactive data sources are accessed.
 * @locus Client
 * @type {Trackr.Computation}
 */
Trackr.currentComputation = null;

// References to all computations created within the Trackr by id.
// Keeping these references on an underscore property gives more control to
// tooling and packages extending Trackr without increasing the API surface.
// These can used to monkey-patch computations, their functions, use
// computation ids for tracking, etc.
Trackr._computations = {};

var setCurrentComputation = function (c) {
	Trackr.currentComputation = c;
	Trackr.active = !! c;
};

var _debugFunc = function () {
	return (typeof console !== "undefined") && console.error ?
			 function () { console.error.apply(console, arguments); } :
			 function () {};
};

var _throwOrLog = function (from, e) {
	if (throwFirstError) {
		throw e;
	} else {
		var printArgs = ["Exception from Trackr " + from + " function:"];
		if (e.stack && e.message && e.name) {
			var idx = e.stack.indexOf(e.message);
			if (idx < 0 || idx > e.name.length + 2) { // check for "Error: "
				// message is not part of the stack
				var message = e.name + ": " + e.message;
				printArgs.push(message);
			}
		}
		printArgs.push(e.stack);

		for (var i = 0; i < printArgs.length; i++) {
			_debugFunc()(printArgs[i]);
		}
	}
};

// Takes a function `f`, and wraps it in a `Meteor._noYieldsAllowed`
// block if we are running on the server. On the client, returns the
// original function (since `Meteor._noYieldsAllowed` is a
// no-op). This has the benefit of not adding an unnecessary stack
// frame on the client.
var withNoYieldsAllowed = function (f) {
	return f;
};

var nextId = 1;
// computations whose callbacks we should call at flush time
var pendingComputations = [];
// `true` if a Trackr.flush is scheduled, or if we are in Trackr.flush now
var willFlush = false;
// `true` if we are in Trackr.flush now
var inFlush = false;
// `true` if we are computing a computation now, either first time
// or recompute.	This matches Trackr.active unless we are inside
// Trackr.nonreactive, which nullfies currentComputation even though
// an enclosing computation may still be running.
var inCompute = false;
// `true` if the `_throwFirstError` option was passed in to the call
// to Trackr.flush that we are in. When set, throw rather than log the
// first error encountered while flushing. Before throwing the error,
// finish flushing (from a finally block), logging any subsequent
// errors.
var throwFirstError = false;

var afterFlushCallbacks = [];

var requestAnimationFrame = require("raf");

var requireFlush = function () {
	if (! willFlush) {
		requestAnimationFrame(Trackr._runFlush);
		willFlush = true;
	}
};

// Trackr.Computation constructor is visible but private
// (throws an error if you try to call it)
var constructingComputation = false;

//
// http://docs.meteor.com/#tracker_computation

/**
 * @summary A Computation object represents code that is repeatedly rerun
 * in response to
 * reactive data changes. Computations don't have return values; they just
 * perform actions, such as rerendering a template on the screen. Computations
 * are created using Trackr.autorun. Use stop to prevent further rerunning of a
 * computation.
 * @instancename computation
 */
Trackr.Computation = function (f, parent, options) {
	if (! constructingComputation)
		throw new Error(
			"Trackr.Computation constructor is private; use Trackr.autorun");
	constructingComputation = false;

	var self = this;
	options = options || {};

	// http://docs.meteor.com/#computation_stopped

	/**
	 * @summary True if this computation has been stopped.
	 * @locus Client
	 * @memberOf Trackr.Computation
	 * @instance
	 * @name	stopped
	 */
	self.stopped = false;

	// http://docs.meteor.com/#computation_invalidated

	/**
	 * @summary True if this computation has been invalidated (and not yet rerun), or if it has been stopped.
	 * @locus Client
	 * @memberOf Trackr.Computation
	 * @instance
	 * @name	invalidated
	 * @type {Boolean}
	 */
	self.invalidated = false;

	// http://docs.meteor.com/#computation_firstrun

	/**
	 * @summary True during the initial run of the computation at the time `Trackr.autorun` is called, and false on subsequent reruns and at other times.
	 * @locus Client
	 * @memberOf Trackr.Computation
	 * @instance
	 * @name	firstRun
	 * @type {Boolean}
	 */
	self.firstRun = true;

	self._id = nextId++;
	self._onInvalidateCallbacks = [];
	self._onStopCallbacks = [];
	// the plan is at some point to use the parent relation
	// to constrain the order that computations are processed
	self._parent = parent;
	self._func = f;
	self._onError = options.onError;
	self._recomputing = false;
	self._context = options.context || null;

	// Register the computation within the global Trackr.
	Trackr._computations[self._id] = self;

	var errored = true;
	try {
		self._compute();
		errored = false;
	} finally {
		self.firstRun = false;
		if (errored)
			self.stop();
	}
};

// http://docs.meteor.com/#computation_oninvalidate

/**
 * @summary Registers `callback` to run when this computation is next invalidated, or runs it immediately if the computation is already invalidated.	The callback is run exactly once and not upon future invalidations unless `onInvalidate` is called again after the computation becomes valid again.
 * @locus Client
 * @param {Function} callback Function to be called on invalidation. Receives one argument, the computation that was invalidated.
 */
Trackr.Computation.prototype.onInvalidate = function (f, ctx) {
	var self = this;

	if (typeof f !== 'function')
		throw new Error("onInvalidate requires a function");

	if (self.invalidated) {
		Trackr.nonreactive(function () {
			withNoYieldsAllowed(f).call(ctx || self._context, self);
		});
	} else {
		self._onInvalidateCallbacks.push({ fn: f, ctx: ctx });
	}
};

/**
 * @summary Registers `callback` to run when this computation is stopped, or runs it immediately if the computation is already stopped.	The callback is run after any `onInvalidate` callbacks.
 * @locus Client
 * @param {Function} callback Function to be called on stop. Receives one argument, the computation that was stopped.
 */
Trackr.Computation.prototype.onStop = function (f, ctx) {
	var self = this;

	if (typeof f !== 'function')
		throw new Error("onStop requires a function");

	if (self.stopped) {
		Trackr.nonreactive(function () {
			withNoYieldsAllowed(f).call(ctx || self._context, self);
		});
	} else {
		self._onStopCallbacks.push({ fn: f, ctx: ctx });
	}
};

// http://docs.meteor.com/#computation_invalidate

/**
 * @summary Invalidates this computation so that it will be rerun.
 * @locus Client
 */
Trackr.Computation.prototype.invalidate = function () {
	var self = this;
	if (! self.invalidated) {
		// if we're currently in _recompute(), don't enqueue
		// ourselves, since we'll rerun immediately anyway.
		if (! self._recomputing && ! self.stopped) {
			requireFlush();
			pendingComputations.push(this);
		}

		self.invalidated = true;

		// callbacks can't add callbacks, because
		// self.invalidated === true.
		for(var i = 0, f; f = self._onInvalidateCallbacks[i]; i++) {
			Trackr.nonreactive(function () {
				withNoYieldsAllowed(f.fn).call(f.ctx || self._context, self);
			});
		}
		self._onInvalidateCallbacks = [];
	}
};

// http://docs.meteor.com/#computation_stop

/**
 * @summary Prevents this computation from rerunning.
 * @locus Client
 */
Trackr.Computation.prototype.stop = function () {
	var self = this;

	if (! self.stopped) {
		self.stopped = true;
		self.invalidate();
		// Unregister from global Trackr.
		delete Trackr._computations[self._id];
		for(var i = 0, f; f = self._onStopCallbacks[i]; i++) {
			Trackr.nonreactive(function () {
				withNoYieldsAllowed(f.fn).call(f.ctx || self._context, self);
			});
		}
		self._onStopCallbacks = [];
	}
};

Trackr.Computation.prototype._compute = function () {
	var self = this;
	self.invalidated = false;

	var previous = Trackr.currentComputation;
	setCurrentComputation(self);
	var previousInCompute = inCompute;
	inCompute = true;
	try {
		withNoYieldsAllowed(self._func).call(self._context, self);
	} finally {
		setCurrentComputation(previous);
		inCompute = previousInCompute;
	}
};

Trackr.Computation.prototype._needsRecompute = function () {
	var self = this;
	return self.invalidated && ! self.stopped;
};

Trackr.Computation.prototype._recompute = function () {
	var self = this;

	self._recomputing = true;
	try {
		if (self._needsRecompute()) {
			try {
				self._compute();
			} catch (e) {
				if (self._onError) {
					self._onError(e);
				} else {
					_throwOrLog("recompute", e);
				}
			}
		}
	} finally {
		self._recomputing = false;
	}
};

//
// http://docs.meteor.com/#tracker_dependency

/**
 * @summary A Dependency represents an atomic unit of reactive data that a
 * computation might depend on. Reactive data sources such as Session or
 * Minimongo internally create different Dependency objects for different
 * pieces of data, each of which may be depended on by multiple computations.
 * When the data changes, the computations are invalidated.
 * @class
 * @instanceName dependency
 */
Trackr.Dependency = function () {
	this._dependentsById = {};
};

// http://docs.meteor.com/#dependency_depend
//
// Adds `computation` to this set if it is not already
// present.	Returns true if `computation` is a new member of the set.
// If no argument, defaults to currentComputation, or does nothing
// if there is no currentComputation.

/**
 * @summary Declares that the current computation (or `fromComputation` if given) depends on `dependency`.	The computation will be invalidated the next time `dependency` changes.

If there is no current computation and `depend()` is called with no arguments, it does nothing and returns false.

Returns true if the computation is a new dependent of `dependency` rather than an existing one.
 * @locus Client
 * @param {Trackr.Computation} [fromComputation] An optional computation declared to depend on `dependency` instead of the current computation.
 * @returns {Boolean}
 */
Trackr.Dependency.prototype.depend = function (computation) {
	if (! computation) {
		if (! Trackr.active)
			return false;

		computation = Trackr.currentComputation;
	}
	var self = this;
	var id = computation._id;
	if (! (id in self._dependentsById)) {
		self._dependentsById[id] = computation;
		computation.onInvalidate(function () {
			delete self._dependentsById[id];
		});
		return true;
	}
	return false;
};

// http://docs.meteor.com/#dependency_changed

/**
 * @summary Invalidate all dependent computations immediately and remove them as dependents.
 * @locus Client
 */
Trackr.Dependency.prototype.changed = function () {
	var self = this;
	for (var id in self._dependentsById)
		self._dependentsById[id].invalidate();
};

// http://docs.meteor.com/#dependency_hasdependents

/**
 * @summary True if this Dependency has one or more dependent Computations, which would be invalidated if this Dependency were to change.
 * @locus Client
 * @returns {Boolean}
 */
Trackr.Dependency.prototype.hasDependents = function () {
	var self = this;
	for(var id in self._dependentsById)
		return true;
	return false;
};

// http://docs.meteor.com/#tracker_flush

/**
 * @summary Process all reactive updates immediately and ensure that all invalidated computations are rerun.
 * @locus Client
 */
Trackr.flush = function (options) {
	Trackr._runFlush({ finishSynchronously: true,
											throwFirstError: options && options._throwFirstError });
};

// Run all pending computations and afterFlush callbacks.	If we were not called
// directly via Trackr.flush, this may return before they're all done to allow
// the event loop to run a little before continuing.
Trackr._runFlush = function (options) {
	// XXX What part of the comment below is still true? (We no longer
	// have Spark)
	//
	// Nested flush could plausibly happen if, say, a flush causes
	// DOM mutation, which causes a "blur" event, which runs an
	// app event handler that calls Trackr.flush.	At the moment
	// Spark blocks event handlers during DOM mutation anyway,
	// because the LiveRange tree isn't valid.	And we don't have
	// any useful notion of a nested flush.
	//
	// https://app.asana.com/0/159908330244/385138233856
	if (inFlush)
		throw new Error("Can't call Trackr.flush while flushing");

	if (inCompute)
		throw new Error("Can't flush inside Trackr.autorun");

	options = options || {};

	inFlush = true;
	willFlush = true;
	throwFirstError = !! options.throwFirstError;

	var recomputedCount = 0;
	var finishedTry = false;
	try {
		while (pendingComputations.length ||
					 afterFlushCallbacks.length) {

			// recompute all pending computations
			while (pendingComputations.length) {
				var comp = pendingComputations.shift();
				comp._recompute();
				if (comp._needsRecompute()) {
					pendingComputations.unshift(comp);
				}

				if (! options.finishSynchronously && ++recomputedCount > 1000) {
					finishedTry = true;
					return;
				}
			}

			if (afterFlushCallbacks.length) {
				// call one afterFlush callback, which may
				// invalidate more computations
				var cb = afterFlushCallbacks.shift();
				try {
					cb.fn.call(cb.ctx);
				} catch (e) {
					_throwOrLog("afterFlush", e);
				}
			}
		}
		finishedTry = true;
	} finally {
		if (! finishedTry) {
			// we're erroring due to throwFirstError being true.
			inFlush = false; // needed before calling `Trackr.flush()` again
			// finish flushing
			Trackr._runFlush({
				finishSynchronously: options.finishSynchronously,
				throwFirstError: false
			});
		}
		willFlush = false;
		inFlush = false;
		if (pendingComputations.length || afterFlushCallbacks.length) {
			// We're yielding because we ran a bunch of computations and we aren't
			// required to finish synchronously, so we'd like to give the event loop a
			// chance. We should flush again soon.
			if (options.finishSynchronously) {
				throw new Error("still have more to do?");	// shouldn't happen
			}
			setTimeout(requireFlush, 10);
		}
	}
};

// http://docs.meteor.com/#tracker_autorun
//
// Run f(). Record its dependencies. Rerun it whenever the
// dependencies change.
//
// Returns a new Computation, which is also passed to f.
//
// Links the computation to the current computation
// so that it is stopped if the current computation is invalidated.

/**
 * @callback Trackr.ComputationFunction
 * @param {Trackr.Computation}
 */
/**
 * @summary Run a function now and rerun it later whenever its dependencies
 * change. Returns a Computation object that can be used to stop or observe the
 * rerunning.
 * @locus Client
 * @param {Trackr.ComputationFunction} runFunc The function to run. It receives
 * one argument: the Computation object that will be returned.
 * @param {Object} [options]
 * @param {Function} options.onError Optional. The function to run when an error
 * happens in the Computation. The only argument it recieves is the Error
 * thrown. Defaults to the error being logged to the console.
 * @returns {Trackr.Computation}
 */
Trackr.autorun = function (f, options, ctx) {
	if (typeof f !== 'function')
		throw new Error('Trackr.autorun requires a function argument');

	options = options || {};
	if (ctx) options.context = ctx;

	constructingComputation = true;
	var c = new Trackr.Computation(
		f, Trackr.currentComputation, options);

	if (Trackr.active)
		Trackr.onInvalidate(function () {
			c.stop();
		});

	return c;
};

// http://docs.meteor.com/#tracker_nonreactive
//
// Run `f` with no current computation, returning the return value
// of `f`.	Used to turn off reactivity for the duration of `f`,
// so that reactive data sources accessed by `f` will not result in any
// computations being invalidated.

/**
 * @summary Run a function without tracking dependencies.
 * @locus Client
 * @param {Function} func A function to call immediately.
 */
Trackr.nonReactive =
Trackr.nonreactive = function (f, ctx) {
	var previous = Trackr.currentComputation;
	setCurrentComputation(null);
	try {
		return f.call(ctx);
	} finally {
		setCurrentComputation(previous);
	}
};

// like nonreactive but makes a function instead
Trackr.nonReactable =
Trackr.nonreactable = function (f, ctx) {
	return function() {
		var args = arguments;
		var self = this;
		return Trackr.nonreactive(function() {
			return f.apply(ctx || self, args);
		});
	};
};

// http://docs.meteor.com/#tracker_oninvalidate

/**
 * @summary Registers a new [`onInvalidate`](#computation_oninvalidate) callback on the current computation (which must exist), to be called immediately when the current computation is invalidated or stopped.
 * @locus Client
 * @param {Function} callback A callback function that will be invoked as `func(c)`, where `c` is the computation on which the callback is registered.
 */
Trackr.onInvalidate = function (f, ctx) {
	if (! Trackr.active)
		throw new Error("Trackr.onInvalidate requires a currentComputation");

	Trackr.currentComputation.onInvalidate(f, ctx);
};

// http://docs.meteor.com/#tracker_afterflush

/**
 * @summary Schedules a function to be called during the next flush, or later in the current flush if one is in progress, after all invalidated computations have been rerun.	The function will be run once and not on subsequent flushes unless `afterFlush` is called again.
 * @locus Client
 * @param {Function} callback A function to call at flush time.
 */
Trackr.afterFlush = function (f, ctx) {
	afterFlushCallbacks.push({ fn: f, ctx: ctx });
	requireFlush();
};

// export it
return Trackr;

})();
