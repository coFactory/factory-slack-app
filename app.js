const { App } = require('@slack/bolt');

const momentLib = require('moment');
const oauth2Lib = require('simple-oauth2')
const axiosLib = require("axios");

// Initializes your app with your bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// We track information on events as it's received, to reduce API calls.
var eventData = {};

const joan = {
  auth: async () => {
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
      const accessToken = oauth2.accessToken.create(result);

      console.log('Bearer ' + accessToken.token.access_token);
      return accessToken;
    } catch (error) {
      console.log('Access Token error', error.message);
    }
  },
  getReservations: async (accessToken) => {
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
  },
  cancelReservation: async (accessToken, eventId, roomId) => {
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
  }
};

// Listens to incoming messages that contain "rooms"
app.message('rooms', async ({ message, say, context }) => {
  // say() sends a message to the channel where the event was triggered
  say(`Here's the schedule, <@${message.user}>:`);

  const profile = await app.client.users.info({
    token: context.botToken,
    user: message.user
  });
  const userEmail = profile.user.profile.email;

  const accessToken = await joan.auth();
  const reservations = await joan.getReservations(accessToken);

  var output = [];
  for (var roomIndex = 0; roomIndex < reservations.length; roomIndex++) {
    var roomOutput = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*' + reservations[roomIndex].room.name + '*'
        }
      }
    ];

    for (var eventIndex = 0; eventIndex < reservations[roomIndex].events.length; eventIndex++) {
      const event = reservations[roomIndex].events[eventIndex];
      eventData[event.id] = event;

      const startTimestamp = Math.floor(new Date(event.start).getTime() / 1000);
      const endTimestamp = Math.floor(new Date(event.end).getTime() / 1000);
      const when = '<!date^' + startTimestamp + '^{date_short_pretty} {time}|' + event.start + '> - <!date^' + endTimestamp + '^{time}|' + event.end + '>';
      const who = /^The Factory Downtown/.test(event.organizer.displayName) ? '' : event.organizer.displayName

      var eventOutput = {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '⏰ ' + when + '  📌 ' + event.summary + '  🙂 ' + who,
        }
      };
      if (event.organizer.email == userEmail) {
        eventOutput.accessory = {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '❌ Cancel'
          },
          action_id: 'cancel_event',
          value: event.id
        };
      }
      roomOutput.push(eventOutput);
    }
    roomOutput.push({
      type: 'divider'
    });
    output = output.concat(roomOutput);
  }
  say({blocks: output});
});

app.action('cancel_event', async ({ body, ack, say }) => {
  ack();
  const eventId = body.actions[0].value;
  const roomId = eventData[eventId].resource;

  const accessToken = await joan.auth();
  await joan.cancelReservation(accessToken, eventId, roomId);
  say('_' + eventData[eventId].summary + '_ was cancelled.');
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log('⚡️ Bolt app is running!');
})();
