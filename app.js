const { App } = require('@slack/bolt');
const joan = require('./joan');
const moment = require('moment-timezone');
const uuidv4 = require('uuid/v4');

// Initializes your app with your bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

const TZ = 'America/Detroit';

// We track information on events as they are received, to reduce API calls.
var eventData = {};

// Track accumulated metadata about conversations in progress.
var conversations = {};


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

      if (moment(event.end) < moment()) {
        continue;
      }

      const startTimestamp = Math.floor(new Date(event.start).getTime() / 1000);
      const endTimestamp = Math.floor(new Date(event.end).getTime() / 1000);
      const when = '⏰ <!date^' + startTimestamp + '^{date_short_pretty} {time}|' + event.start + '> - <!date^' + endTimestamp + '^{time}|' + event.end + '>';
      const what = (event.summary != 'Booked' && event.summary != 'Booked (Slack)') ? '📌 ' + event.summary : '';
      const who = event.organizer.displayName ? (/^The Factory Downtown/.test(event.organizer.displayName) ? '' : ':bust_in_silhouette: ' + event.organizer.displayName) : '';

      var eventOutput = {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: when + '  ' + what + '  ' + who,
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
        }
      ]
    }
  });
});

app.action({ callback_id: 'book_room' }, async ({ body, ack, respond }) => {
  const testDate = moment.tz(body.submission.date, 'MM/DD/YYYY', TZ);
  const startMoment = moment.tz(body.submission.date + ' ' + body.submission.start, 'MM/DD/YYYY hh:mm A', TZ);
  const endMoment = moment.tz(body.submission.date + ' ' + body.submission.end, 'MM/DD/YYYY hh:mm A', TZ);
  var errors = [];
  if (!testDate.isValid()) {
    errors.push({
      name: 'date',
      error: 'Must be a valid date in MM/DD/YYYY format.'
    });
  }
  if (!startMoment.isValid()) {
    errors.push({
      name: 'start',
      error: 'Could not understand that start date/time.'
    });
  }
  if (!endMoment.isValid()) {
    errors.push({
      name: 'end',
      error: 'Could not understand that end date/time.'
    });
  }
  if (errors.length == 0) {
    const duration = moment.duration(endMoment.diff(startMoment)).asMinutes();
    if (duration < 1) {
      errors.push({
        name: 'end',
        error: 'End time must be after start time.'
      });
    }
  }

  if (errors.length) {
    ack({errors: errors});
    return;
  }

  ack();

  const conversationId = uuidv4();
  conversations[conversationId] = {
    expire: moment().add(1, 'hours'),
    purpose: body.submission.purpose,
    startMoment: startMoment,
    endMoment: endMoment
  };

  // console.log(joan.availableRooms(startMoment.toISOString(), duration));

  const rooms = await joan.getRooms();

  respond({
    blocks: [
      {
        type: 'section',
        block_id: conversationId,
        text: {
          type: 'mrkdwn',
          text: 'Room to reserve:'
        },
        accessory: {
          type: 'static_select',
          action_id: 'book_room_select',
          placeholder: {
            type: 'plain_text',
            text: 'Select room...',
          },
          options: rooms.map((room, index) => {
            return {
              text: {
                type: 'plain_text',
                text: room.name
              },
              value: index.toString()
            };
          })
        }
      }
    ],
    response_type: 'ephemeral'
  });
});

app.action('book_room_select', async ({ body, ack, respond, context }) => {
  ack();

  const conversationData = conversations[body.actions[0].block_id];
  if (!conversationData) {
    respond({
      text: 'This booking session seems to have expired. Please try a new one.',
      response_type: 'ephemeral'
    });
    return;
  }

  const profile = await app.client.users.info({
    token: context.botToken,
    user: body.user.id
  });

  const rooms = await joan.getRooms();
  const room = rooms[body.actions[0].selected_option.value];

  const startDateTime = conversationData.startMoment.toIsoString();
  const endDateTime = conversationData.endMoment.toIsoString();
  const userEmail = profile.user.profile.email;
  const title = conversationData.purpose;

  const event = await joan.bookRoom(room.email, startDateTime, endDateTime, userEmail, title);
  if (event) {
    respond({
      text: 'Successfully booked *' + event.summary + '* for _' + moment.tz(event.start, TZ).format('ddd [the] Do [at] h:mm A') + '_ in *' + room.name + '*.',
      response_type: 'ephemeral'
    });
  }
  else {
    respond({
      text: 'Sorry, I could not book *' + room.name + '* for _' + moment.tz(startDateTime, TZ).format('ddd [the] Do [at] h:mm A') + '_.',
      response_type: 'ephemeral'
    });
  }

});


(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log('⚡️ Bolt app is running!');
})();
