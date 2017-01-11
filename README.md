# react-native-meteor-redux
Links react-native-meteor to redux

## Install
`npm install react-native-meteor-redux`

## Use
At it's basic level, `react-native-meteor-redux` will add any documents from minimongo to redux.
````javascript
import initMeteorRedux from 'react-native-meteor-redux';

const MeteorStore = initMeteorRedux(initialState, enhancers);

// Now you can access MeteorStore as a redux store throughout your app.
export {MeteorStore};
````

## With Redux Persist
The real purpose of this package is to allow persisting through `redux-persist`
### Initializing
````javascript
// myReduxStuff.js
import initMeteorRedux from 'react-native-meteor-redux';
import {AsyncStorage} from 'react-native';
import {persistStore, autoRehydrate} form 'redux-persist';

const MeteorStore = initMeteorRedux(null, autoRehydrate());

// Pick your storage option, I used AsyncStorage which makes sense for react-native
persistStore(MeteorStore, {storage: AsyncStorage}, () => {
  // Callback tells minimongo to use MeteorStore until connectivity is restored
  MeteorStore.loaded()
});

export {MeteorStore}
````

### Using cached collection
You should be able to find documents as normal. I'm not sure what will happen if you do updates/inserts/removes when offline, let me know what happens :)

````javascript
import {subscribeCached} from 'react-native-meteor-redux';
import {MeteorStore} from '../myReduxStuff';
import Meteor, {createContainer} from 'react-native-meteor';

const component = (props) => {
  const {docs} = props;
  return (
    <View>
      {
        docs.map((doc) => {
          <Text>{doc.title}, </Text>
        });
      }
    </View>
  )
}

export createContainer((props) => {
  const sub = subscribeCached(MeteorStore, 'example', {user: 'Mikey'});
  return {
    docs: Meteor.collection('docs').find({}),
  };
}, component)
````
