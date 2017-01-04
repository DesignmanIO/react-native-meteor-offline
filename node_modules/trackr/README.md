# Trackr

This is a fork of [Meteor Tracker](https://github.com/meteor/meteor/tree/devel/packages/tracker), the library formerly known as Meteor Deps. It has been repackaged into a standalone library that is ready to use in Node.js and the browser.

Trackr's API is completely backwards compatible with Meteor's version. If you are not familiar with Meteor Tracker, or reactive programming in general, I recommend reading the [Meteor Manual entry on Deps](http://manual.meteor.com/#deps). The concepts it teaches apply here as well.

## Install

Download the latest version from the [release page](https://github.com/BeneathTheInk/Trackr/releases) and use via a script tag. The variable `Trackr` will be attached to `window`.

```html
<script type="text/javascript" src="trackr.js"></script>
```

For Browserify and Node.js, install via NPM and require as necessary.

```sh
$ npm install trackr
```

```js
var Trackr = require("trackr");
```

## Usage

The only change that has been made is the addition of function context. Method context (`this`) can be added as an optional argument to the end of methods that accept functions. For example, here is how you would use `autorun()` with context:

```javascript
var ctx = { foo: "bar" };

var comp = Trackr.autorun(function() {
    console.log(this.foo); // "bar"
}, { /* options */ }, ctx);
```

This also works for `onInvalidate()` and `afterFlush()` callbacks. `onInvalidate()` will fallback on the context provided to the computation if none is provided.

```javascript
comp.onInvalidate(function() {
    console.log(this.foo); // "bar"
});

Trackr.afterFlush(function() {
    console.log(this.hello); // "world"
}, {
    hello: "world"
});
```
