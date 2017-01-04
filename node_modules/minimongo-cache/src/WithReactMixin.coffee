invariant = require 'invariant'

createMixin = (db) ->
  Mixin =
    componentWillMount: ->
      invariant @observeData?, 'You must implement observeData: ' + @constructor.displayName
      @subscription = null;
      @prevData = null
      @data = {}
      if @shouldComponentUpdate?
        @_userShouldComponentUpdate = @shouldComponentUpdate
        @shouldComponentUpdate = @_shouldComponentUpdate

      @_refresh()

    _shouldComponentUpdate: (nextProps, nextState, nextContext) ->
      nextData = @data
      @data = @prevData
      try
        return @_userShouldComponentUpdate(nextProps, nextState, nextData, nextContext)
      finally
        @data = nextData
        @prevData = @data

    _refresh: ->
      if @subscription
        @subscription.dispose()

      @subscription = db.observe(@observeData)
      @subscription.subscribe @_setData

    _setData: (nextData, prevData) ->
      @prevData = @data
      @data = nextData
      if prevData
        @setState({})

    componentWillUpdate: (nextProps, nextState) ->
      prevProps = @props
      prevState = @state

      @props = nextProps
      @state = nextState
      try
        @_refresh()
      finally
        @props = prevProps
        @state = prevState

    componentWillUnmount: ->
      if @subscription
        @subscription.dispose()


WithReactMixin =
  getReactMixin: ->
    if not @mixin?
      @mixin = createMixin this
    return @mixin

module.exports = WithReactMixin
