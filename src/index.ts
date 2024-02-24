/**
 * The core server that runs on a Cloudflare worker.
 */

import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { BgentRuntime, wait, type Message, type Content } from 'bgent';
import { UUID } from 'crypto';
import {
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from 'discord-interactions';
import { Router } from 'itty-router';
import getUuid from 'uuid-by-string';

// Add this function to fetch the bot's name
async function fetchBotName(botToken: string) {
  const url = 'https://discord.com/api/v10/users/@me';

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Error fetching bot details: ${response.statusText}`);
  }

  const data = await response.json();
  return data.username; // Or data.tag for username#discriminator
}

// Modify this function to include fetching the bot's name if the user is an agent
async function ensureUserExists(
  supabase: SupabaseClient,
  userId: UUID,
  userName: string | null,
  botToken?: string,
) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user:', error);
  }

  if (data) {
    console.log('User exists:', data);
  }

  if (!data) {
    // If userName is not provided and botToken is, fetch the bot's name
    if (!userName && botToken) {
      userName = await fetchBotName(botToken);
    }

    // User does not exist, so create them
    const { error } = await supabase.from('accounts').insert([
      {
        id: userId,
        name: userName,
        email: userName + '@discord',
        register_complete: true,
      },
    ]);

    if (error) {
      console.error('Error creating user:', error);
    } else {
      console.log(`User ${userName} created successfully.`);
    }
  }
}

// Function to ensure a room exists
async function ensureRoomExists(supabase: SupabaseClient, roomId: UUID) {
  const { data, error } = await supabase
    .from('rooms') // Replace 'rooms' with your actual rooms table name
    .select('*')
    .eq('id', roomId)
    .single();

  if (error) {
    console.error('Error fetching room:', error);
  }

  if (!data) {
    // Room does not exist, so create it
    const { error } = await supabase
      .from('rooms') // Replace 'rooms' with your actual rooms table name
      .insert([{ id: roomId }]);

    if (error) {
      console.error('Error creating room:', error);
    } else {
      console.log(`Room ${roomId} created successfully.`);
    }
  }
}

// Function to ensure a participant is linked to a room
async function ensureParticipantInRoom(
  supabase: SupabaseClient,
  userId: UUID,
  roomId: UUID,
) {
  const { data, error } = await supabase
    .from('participants') // Replace 'participants' with your actual participants table name
    .select('*')
    .eq('user_id', userId)
    .eq('room_id', roomId)
    .single();

  if (error) {
    console.error('Error fetching participant:', error);
  }

  if (!data) {
    // Participant does not exist, so link user to room
    const { error } = await supabase
      .from('participants') // Replace 'participants' with your actual participants table name
      .insert([{ user_id: userId, room_id: roomId }]);

    if (error) {
      console.error('Error linking user to room:', error);
    } else {
      console.log(`User ${userId} linked to room ${roomId} successfully.`);
    }
  }
}

/**
 * Share command metadata from a common spot to be used for both runtime
 * and registration.
 */

const HELP_COMMAND = {
  name: 'help',
  description: 'Ask a question about the project.',
  options: [
    {
      name: 'question',
      description: 'The question to ask.',
      type: 3,
      required: false,
    },
  ],
};

const SEND_CREDIT_COMMAND = {
  name: 'sendcredit',
  description: 'Send credit to a user',
  options: [
    {
      name: 'discord_id',
      description: 'The Discord ID of the receiver',
      type: 3, // Type 3 is for string
      required: true,
    },
    {
      name: 'amount',
      description: 'The amount of credit to send',
      type: 4, // Type 4 is for integer
      required: true,
    },
    {
      name: 'reason',
      description: 'The reason for sending credit',
      type: 3, // Type 3 is for string
      required: true,
    },
  ],
};

const GET_CREDIT_COMMAND = {
  name: 'getcredit',
  description: 'Get the total credit for a user',
  options: [
    {
      name: 'discord_id',
      description: 'The Discord ID of the user',
      type: 3, // Type 3 is for string
      required: true,
    },
  ],
};

class JsonResponse extends Response {
  constructor(body: BodyInit | unknown, init: ResponseInit) {
    const jsonBody = JSON.stringify(body);
    init = init || {
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
    };
    super(jsonBody, init);
  }
}

const router = Router();

/**
 * A simple :wave: hello page to verify the worker is working.
 */
router.get('/', (_request, env) => {
  return new Response(`👋 ${env.DISCORD_APPLICATION_ID}`);
});

/**
 * Refresh the commands
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
router.get('/commands', async (_request, env) => {
  const token = env.DISCORD_TOKEN;
  const applicationId = env.DISCORD_APPLICATION_ID;

  if (!token) {
    throw new Error('The DISCORD_TOKEN environment variable is required.');
  }
  if (!applicationId) {
    throw new Error(
      'The DISCORD_APPLICATION_ID environment variable is required.',
    );
  }

  /**
   * Register all commands globally.  This can take o(minutes), so wait until
   * you're sure these are the commands you want.
   */
  const url = `https://discord.com/api/v10/applications/${applicationId}/commands`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${token}`,
    },
    method: 'PUT',
    body: JSON.stringify([
      HELP_COMMAND,
      SEND_CREDIT_COMMAND,
      GET_CREDIT_COMMAND,
    ]),
  });

  if (response.ok) {
    console.log('Registered all commands');
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.error('Error registering commands');
    let errorText = `Error registering commands \n ${response.url}: ${response.status} ${response.statusText}`;
    const error = await response.text();
    if (error) {
      errorText = `${errorText} \n\n ${error}`;
    }
    console.error(errorText);
  }
  return new Response('Commands refreshed');
});

/**
 * Main route for all requests sent from Discord.  All incoming messages will
 * include a JSON payload described here:
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 */
router.post('/', async (request, env, event) => {
  const { isValid, interaction } = await server.verifyDiscordRequest(
    request,
    env,
  );

  const adminRoles = env.DISCORD_ADMIN_ROLE_IDS.split(',');

  if (!isValid || !interaction) {
    return new Response('Bad request signature.', { status: 401 });
  }

  if (interaction.type === InteractionType.PING) {
    // @ts-expect-error - This is a valid response type
    return new JsonResponse({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_API_KEY,
      {
        auth: { persistSession: false },
      },
    );

    console.log('created supabase');

    const userId = getUuid(interaction.member.user.id) as UUID;
    const userName = interaction.member.user.username;
    const agentId = getUuid(env.DISCORD_APPLICATION_ID) as UUID;
    const room_id = getUuid(interaction.channel_id) as UUID;

    console.log('got ids');

    // // Ensure all necessary records exist in Supabase
    await ensureUserExists(supabase, agentId, null, env.DISCORD_TOKEN);
    console.log('ensured user exists');
    await ensureUserExists(supabase, userId, userName);
    await ensureRoomExists(supabase, room_id);
    await ensureParticipantInRoom(supabase, userId, room_id);
    await ensureParticipantInRoom(supabase, agentId, room_id);

    const messageContent = interaction.data.options[0].value;
    console.log('interaction.data', interaction.data);

    const message = {
      content: { content: messageContent },
      senderId: userId,
      agentId,
      userIds: [userId, agentId],
      room_id,
    } as unknown as Message;

    const runtime = new BgentRuntime({
      debugMode: true,
      serverUrl: 'https://api.openai.com/v1',
      supabase: supabase,
      token: env.OPENAI_API_KEY,
      evaluators: [],
      actions: [wait],
    });

    // Immediately acknowledge the interaction with a deferred response
    // @ts-expect-error - This is a valid response type
    const deferredResponse = new JsonResponse({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });

    event.waitUntil(
      (async () => {
        let responseContent = 'How can I assist you?'; // Default response
        if (interaction.data.name === HELP_COMMAND.name) {
          const data = (await runtime.handleRequest(message)) as Content;

          responseContent = `You asked: \`\`\`${
            (message.content as Content).content
          }\`\`\`\nAnswer: ${data.content}`;
        } else if (
          interaction.data.name === SEND_CREDIT_COMMAND.name &&
          adminRoles.some((role: string) =>
            interaction.member.roles.includes(role),
          )
        ) {
          const discordId = interaction.data.options.find(
            (option: { name: string }) => option.name === 'discord_id',
          ).value;
          const amount = interaction.data.options.find(
            (option: { name: string }) => option.name === 'amount',
          ).value;
          const reason = interaction.data.options.find(
            (option: { name: string }) => option.name === 'reason',
          ).value;

          // Insert the credit data into the 'credits' table
          const { error } = await supabase.from('credits').insert([
            {
              receiver_id: discordId,
              amount: amount,
              reason: reason,
              sender_id: userId,
            },
          ]);

          if (error) {
            console.error('Error sending credit:', error);
            responseContent = `Error sending credit: ${error.message}`;
          } else {
            responseContent = `Credit sent successfully to ${discordId} for ${amount} credits. Reason: ${reason}`;
          }
        }

        // Handling the /getcredit command
        else if (interaction.data.name === GET_CREDIT_COMMAND.name) {
          const discordId = interaction.data.options.find(
            (option: { name: string }) => option.name === 'discord_id',
          ).value;

          // Fetch and sum the credits from the 'credits' table
          const { data, error } = await supabase
            .from('credits')
            .select('amount')
            .eq('receiver_id', discordId);

          if (error) {
            console.error('Error fetching credits:', error);
            responseContent = `Error fetching credits: ${error.message}`;
          } else {
            const totalCredit = data.reduce(
              (acc, { amount }) => acc + amount,
              0,
            );
            responseContent = `Total credits for ${discordId}: ${totalCredit}`;
          }
        }

        const followUpUrl = `https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`;

        // Send the follow-up message with the actual response
        console.log('followUpUrl', followUpUrl);
        const followUpResponse = await fetch(followUpUrl, {
          method: 'PATCH', // Use PATCH to edit the original deferred message
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bot ${env.DISCORD_TOKEN}`,
          },
          body: JSON.stringify({ content: responseContent }),
        });

        console.log(
          'Follow-up response status:',
          JSON.stringify(followUpResponse),
        );
        const followUpData = await followUpResponse.json();
        console.log('Follow-up response data:', followUpData);
      })(),
    );

    // Return the deferred response to Discord immediately
    return deferredResponse;
  }

  // Fallback for unknown types or commands
  return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
});

router.all('*', () => new Response('Not Found.', { status: 404 }));

async function verifyDiscordRequest(
  request: Request,
  env: { [key: string]: string },
) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();
  const isValidRequest =
    signature &&
    timestamp &&
    verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
  if (!isValidRequest) {
    return { isValid: false };
  }

  return { interaction: JSON.parse(body), isValid: true };
}

const server = {
  verifyDiscordRequest: verifyDiscordRequest,
  fetch: async function (
    request: Request,
    env: { [key: string]: string },
    // @ts-expect-error - This is a valid event type
    event,
  ) {
    return router.handle(request, env, event);
  },
};

export default server;
