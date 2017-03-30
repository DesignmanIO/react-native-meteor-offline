import React, { PropTypes } from 'react';
import Meteor, { createContainer } from 'react-native-meteor';
import Details from './Details';
// react-native-meteor-redux
import {subscribeCached} from 'react-native-meteor-redux';
import {MeteorStore} from '../../index';
// end react-native-meteor-redux

const DetailsContainer = ({ detailsReady }) => {
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
  const handle = subscribeCached(MeteorStore, 'details-list', 'tester', {test: 'test'}, (err, res) => {
    console.log(err, res);
  });
  // end react-native-meteor-redux
  return {
    detailsReady: handle.ready(),
  };
}, DetailsContainer);
