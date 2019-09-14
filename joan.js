'use strict';

const oauth2Lib = require('simple-oauth2');
const axiosLib = require('axios');

var joan = {};

var accessToken = false;

const getAccessToken = async () => {
  if (accessToken && !accessToken.expired()) {
    // Provide a window of time before the actual expiration to refresh the token
    const EXPIRATION_WINDOW_IN_SECONDS = 300;

    const expirationTimeInSeconds = accessToken.token.expires_at.getTime() / 1000;
    const expirationWindowStart = expirationTimeInSeconds - EXPIRATION_WINDOW_IN_SECONDS;

    // If the start of the window has passed, refresh the token
    const nowInSeconds = (new Date()).getTime() / 1000;
    const shouldRefresh = nowInSeconds >= expirationWindowStart;

    if (!shouldRefresh) {
      return accessToken;
    }
  }

  const oauth2 = oauth2Lib.create({
    client: {
      id: process.env.JOAN_CONSUMER_KEY,
      secret: process.env.JOAN_CONSUMER_SECRET
    },
    auth: {
      tokenHost: 'https://portal.getjoan.com',
      tokenPath: '/api/token/'
    }
  });

  try {
    const result = await oauth2.clientCredentials.getToken({
      scope: 'read write'
    });
    accessToken = oauth2.accessToken.create(result);

    console.log('Bearer ' + accessToken.token.access_token);
    return accessToken;
  } catch (error) {
    console.log('Access Token error', error.message);
  }
};

/**
 * Fetch all active reservations.
 */
joan.getReservations = async () => {
  const accessToken = await getAccessToken();
  const url = 'https://portal.getjoan.com/api/v1.0/events/';

  try {
    const response = await axiosLib({
      method: 'get',
      url: url,
      headers: {
        'Authorization': 'Bearer ' + accessToken.token.access_token
      }
    });
    const data = response.data;
    return(data);
  } catch (error) {
    console.log(error);
  }
};

/**
 * Cancel a specific reservation.
 */
joan.cancelReservation = async (eventId, roomId) => {
  const accessToken = await getAccessToken();
  const url = 'https://portal.getjoan.com/api/v1.0/events/cancel/';

  try {
    const response = await axiosLib({
      method: 'post',
      url: url,
      headers: {
        'Authorization': 'Bearer ' + accessToken.token.access_token
      },
      data: {
        finish: false,
        event_id: eventId,
        room_id: roomId,
        timezone: 'America/Detroit'
      }
    });
    const data = response.data;
    return(data);
  } catch (error) {
    console.log(error);
  }
};


module.exports = joan;
