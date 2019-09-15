const { App } = require('@slack/bolt');
const joan = require('./joan');
const moment = require('moment');

// Initializes your app with your bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// We track information on events as they are received, to reduce API calls.
var eventData = {};

// Listens for /rooms command
app.command('/rooms', async ({ command, ack, respond, context }) => {
  ack();

  respond({
    text: `Here's the schedule, <@${command.user_id}>:`,
    response_type: 'ephemeral'
  });

  const profile = await app.client.users.info({
    token: context.botToken,
    user: command.user_id
  });
  const userEmail = profile.user.profile.email;

  const reservations = await joan.getReservations();

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
  respond({
    blocks: output,
    response_type: 'ephemeral'
  });
});

app.action('cancel_event', async ({ body, ack, respond }) => {
  ack();
  const eventId = body.actions[0].value;
  const roomId = eventData[eventId].resource;

  await joan.cancelReservation(eventId, roomId);
  respond({
    text: '_' + eventData[eventId].summary + '_ was cancelled.',
    response_type: 'ephemeral'
  });
});

// Listens for /book command
app.command('/book', async ({ command, ack, respond, context }) => {
  ack();

  await app.client.dialog.open({
    token: context.botToken,
    trigger_id: command.trigger_id,
    dialog: {
      callback_id: 'book_room',
      title: 'Book a Room',
      submit_label: 'Book',
      elements: [
        {
          type: 'text',
          label: 'Purpose',
          name: 'purpose',
          hint: 'Displayed on placard during meeting.',
          value: command.text
        },
        {
          type: 'text',
          label: 'Date',
          name: 'date',
          value: moment().format('MM/DD/YYYY')
        },
        {
          type: 'text',
          label: 'Start Time',
          name: 'start',
          value: moment().startOf('hour').add(1, 'h').format('hh:mm A')
        },
        {
          type: 'text',
          label: 'End Time',
          name: 'end',
          value: moment().startOf('hour').add(2, 'h').format('hh:mm A')
        },
        {
          type: 'select',
          label: 'Room',
          name: 'room',
          options: [
            {
              label: 'Room 1',
              value: 'one'
            },
            {
              label: 'Room 2',
              value: 'two'
            }
          ]
        }
      ]
    }
  });
});

app.action({ callback_id: 'book_room' }, async ({ body, ack, respond }) => {
  ack();
  console.log(body);
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log('⚡️ Bolt app is running!');
})();
