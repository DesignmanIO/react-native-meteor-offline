import React from 'react';
import Meteor, { createContainer } from 'react-native-meteor';

// react-native-meteor-redux
import initMeteorRedux from 'react-native-meteor-redux';
import { AsyncStorage } from 'react-native';
import { persistStore, autoRehydrate } from 'redux-persist';
// end react-native-meteor-redux

import LoggedOut from './layouts/LoggedOut';
import LoggedIn from './layouts/LoggedIn';
import Loading from './components/Loading';
import settings from './config/settings';

Meteor.connect(settings.METEOR_URL);

// react-native-meteor-redux
const MeteorStore = initMeteorRedux(undefined, autoRehydrate());
persistStore(MeteorStore, { storage: AsyncStorage }, () => {
  MeteorStore.loaded();
});
setTimeout(() => console.log(MeteorStore.getState()), 10000);
export { MeteorStore }
// end react-native-meteor-redux

const RNApp = (props) => {
  const { status, user, loggingIn } = props;

  if (loggingIn) {
    return <Loading />;
  } else
  if (user !== null) {
    return <LoggedIn />;
  }
  return <LoggedOut />;
};

RNApp.propTypes = {
  status: React.PropTypes.object,
  user: React.PropTypes.object,
  loggingIn: React.PropTypes.bool,
};

export default createContainer(() => {
  return {
    status: Meteor.status(),
    user: Meteor.user(),
    loggingIn: Meteor.loggingIn(),
  };
}, RNApp);
