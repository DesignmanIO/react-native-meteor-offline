import React, { PropTypes } from 'react';
import Meteor, { createContainer } from 'react-native-meteor';
import Details from './Details';
// react-native-meteor-redux
import {subscribeCached, MeteorOffline} from 'react-native-meteor-redux';
import {MeteorStore, MO} from '../../index';
// end react-native-meteor-redux

const DetailsContainer = ({ detailsReady }) => {
  // console.log(detailsReady);
  return (
    <Details
      detailsReady={detailsReady}
    />
  );
};

DetailsContainer.propTypes = {
  detailsReady: PropTypes.bool,
};

export default createContainer(() => {
  // react-native-meteor-redux
  // const handle = subscribeCached(MeteorStore, 'details-list');
  const handle = MO.subscribe('detailsByParam', 'details-list', 'param', {test: 'test'}, () => console.log('callback'));
  const details = MO.collection('details', 'detailsByParam').find();
  console.log(details.length, Meteor.user(), MO.user());
  // console.log(MO.store.getState());
  // end react-native-meteor-redux
  return {
    detailsReady: handle.ready(),
  };
}, DetailsContainer);
