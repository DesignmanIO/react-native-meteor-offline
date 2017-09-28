import React from 'react';
import Home from '../routes/Home';
import Details from '../routes/Details';
import Profile from '../routes/Profile';
import SignIn from '../routes/SignIn';
import { TouchableOpacity, Text, View } from 'react-native';
import { MO } from '../index';

export const routes = {
  getHomeRoute() {
    return {
      renderScene(navigator) {
        return <Home navigator={navigator} />;
      },

      getTitle() {
        return 'Home';
      },
    };
  },
  getDetailsRoute() {
    return {
      renderScene(navigator) {
        return <Details navigator={navigator} />;
      },

      renderRightButton() {
        return (
          <TouchableOpacity onPress={() => MO.persister.purge()}>
            <View>
              <Text>{MO.subReady('detailsByParam') ? 'Sub ready' : 'Sub not ready'}</Text>
              <Text>Purge Cache</Text>
            </View>
          </TouchableOpacity>
        );
      },

      getTitle() {
        return 'Details';
      },
    };
  },
  getProfileRoute() {
    return {
      renderScene(navigator) {
        return <Profile navigator={navigator} />;
      },

      showNavigationBar: false,
    };
  },
  getSignInRoute() {
    return {
      renderScene(navigator) {
        return <SignIn navigator={navigator} />;
      },

      showNavigationBar: false,
    };
  },
};

export default routes;
