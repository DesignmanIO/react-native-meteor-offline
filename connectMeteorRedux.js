/**
 * Created by Julian on 12/30/16.
 */
import Meteor from 'react-native-meteor';
import {createStore} from 'redux';
import _ from 'lodash';

const meteorReduxReducers = (state = {}, action) => {
  const {type, collection, id, fields} = action;
  const docIndex = _.findIndex(state[collection], {_id: id});
  switch (type) {
    case 'ADDED':
      if (!state[collection]) {
        return {
          ...state,
          [collection]: [
            Object.assign(fields, {_id: id}),
          ],
        };
      } else if (!_.find(state[collection], {_id: id})) {
        return {
          ...state,
          [collection]: [
            ...state[collection],
            Object.assign(fields, {_id: id}),
          ],
        };
      } else if (_.find(state[collection], {_id: id})) {
        console.error(`${id} not added to ${collection}, duplicate found`);
      }
      return state;
    case 'CHANGED':
      return _.update(state, `${collection}[${docIndex}]`, (val) => {
        return _.merge(val, fields);
      });
    case 'REMOVED':
      if (docIndex > -1) {
        // console.log('rm\'d');
        const updatedCollection = _.filter(state[collection], (doc) => doc._id !== id);
        return {
          ...state,
          [collection]: updatedCollection,
        };
      }
      console.error(`Couldn't remove ${id}, not found in ${collection} collection`);
      return state;
    case 'persist/REHYDRATE':
    if(typeof Meteor.ddp === undefined || Meteor.ddp.status === "disconnected"){
      return action.payload;
    }
    default:
      return state;
  }
};

const initMeteorRedux = (preloadedState = undefined, enhancer = null) => {
  // console.log(preloadedState, enhancer);
  const MeteorStore = createStore(meteorReduxReducers, preloadedState, enhancer);

  Meteor.waitDdpConnected(() => {
    // question: do I need to check for disconnection?
    let connected = true;
    Meteor.ddp.on('disconnected', () => {
      connected = false;
    });
    if (connected) {
      Meteor.ddp.on('removed', (obj) => {
        const {collection, id, fields} = obj;
        MeteorStore.dispatch({type: 'REMOVED', collection, id, fields});
      });
      Meteor.ddp.on('changed', (obj) => {
        const {collection, id, fields} = obj;
        MeteorStore.dispatch({type: 'CHANGED', collection, id, fields});
      });
      Meteor.ddp.on('added', (obj) => {
        const {collection, id, fields} = obj;
        MeteorStore.dispatch({type: 'ADDED', collection, id, fields});
      });
    }
  });

  return MeteorStore;
};

export {meteorReduxReducers};
export default initMeteorRedux;
// export default connectMeteorRedux;
