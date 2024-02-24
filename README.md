# The Alliance Community Discord Bot

This bot features the following commands:
/help - Get help, based on the documentation the bot has been trained on
/sendcredit - Send credit to another user, only available to whitelisted roles
/getcredit - Get the credit amount of a user


This bot is based on the tutorial [in the Discord developer documentation](https://discord.com/developers/docs/tutorials/hosting-on-cloudflare-workers)

## Resources used

- [Discord Interactions API](https://discord.com/developers/docs/interactions/receiving-and-responding)
- [Cloudflare Workers](https://workers.cloudflare.com/) for hosting
- [bgent](https://www.npmjs.com/package/bgent)

---

## Configuring project

Before starting, you'll need a [Discord app](https://discord.com/developers/applications) with the following permissions:

- `bot` with the `Send Messages` and `Use Slash Command` permissions
- `applications.commands` scope

> ⚙️ Permissions can be configured by clicking on the `OAuth2` tab and using the `URL Generator`. After a URL is generated, you can install the app by pasting that URL into your browser and following the installation flow.

## Database setup

This library uses Supabase as a database. You can set up a free account at [supabase.io](https://supabase.io) and create a new project.

### TODO: Add script and instructions for deploying fresh copy of database

## Local supabase deployment instructions
Step 1: On the Subase All Projects Dashboard, select “New Project”.  
Step 2: Select the organization to store the new project in, assign a database name, password and region.  
Step 3: Select “Create New Project”.  
Step 4: Wait for the database to setup. This will take a few minutes as supabase setups various directories.  
Step 5: Select the “SQL Editor” tab from the left navigation menu.  
Step 6: Copy in your own SQL dump file or optionally use the provided file in the bgent directory at: "https://github.com/JoinTheAlliance/bgent/blob/main/src/supabase/db.sql". Note: You can use the command "supabase db dump" if you have a pre-exisiting supabase database to generate the SQL dump file.  
Step 7: Paste the SQL code into the SQL Editor and hit run in the bottom right.  
Step 8: Select the “Databases” tab from the left navigation menu to verify all of the tables have been added properly.

## Creating your Cloudflare worker

Next, you'll need to create a Cloudflare Worker.

- Visit the [Cloudflare dashboard](https://dash.cloudflare.com/)
- Click on the `Workers` tab, and create a new service using the same name as your Discord bot

## Running locally

First clone the project:

```
git clone https://github.com/lalalune/creditbot.git
```

Then navigate to its directory and install dependencies:

```
cd creditbot
npm install
```

> ⚙️ The dependencies in this project require at least v18 of [Node.js](https://nodejs.org/en/)

### Local configuration

> 💡 More information about generating and fetching credentials can be found [in the tutorial](https://discord.com/developers/docs/tutorials/hosting-on-cloudflare-workers#storing-secrets)

Rename `example.dev.vars` to `.dev.vars`, and make sure to set each variable.

**`.dev.vars` contains sensitive data so make sure it does not get checked into git**.

### Register commands

To refresh the commands for your bot, visit this URL in your browser:

```
https://localhost:8787/commands
```

### Run app

Now you should be ready to start your server:

```
npm run dev
```

### Setting up ngrok

When a user types a slash command, Discord will send an HTTP request to a given endpoint. During local development this can be a little challenging, so we're going to use a tool called `ngrok` to create an HTTP tunnel.

```
npm run ngrok
```

![forwarding](https://user-images.githubusercontent.com/534619/157511497-19c8cef7-c349-40ec-a9d3-4bc0147909b0.png)

This is going to bounce requests off of an external endpoint, and forward them to your machine. Copy the HTTPS link provided by the tool. It should look something like `https://8098-24-22-245-250.ngrok.io`. Now head back to the Discord Developer Dashboard, and update the "Interactions Endpoint URL" for your bot:

![interactions-endpoint](https://user-images.githubusercontent.com/534619/157510959-6cf0327a-052a-432c-855b-c662824f15ce.png)

This is the process we'll use for local testing and development. When you've deployed your bot to Cloudflare, you will _want to update this field to use your Cloudflare Worker URL._

## Deploying app

This repository is set up to automatically deploy to Cloudflare Workers when new changes land on the `main` branch. To deploy manually, run `npm run deploy`, which uses the `wrangler deploy` command under the hood. Deploying via a GitHub Action requires obtaining an [API Token and your Account ID from Cloudflare](https://developers.cloudflare.com/workers/wrangler/cli-wrangler/authentication/#generate-tokens). These are stored [as secrets in the GitHub repository](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository), making them available to GitHub Actions. The following configuration in `.github/workflows/ci.yaml` demonstrates how to tie it all together:

```yaml
release:
  if: github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  needs: [test, lint]
  steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: 18
    - run: npm install
    - run: npm run deploy
      env:
        CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
        CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
```

### Storing secrets

The credentials in `.dev.vars` are only applied locally. The production service needs access to credentials from your app:

```
wrangler secret put DISCORD_TOKEN
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put DISCORD_APPLICATION_ID
wrangler secret put OPENAI_API_KEY
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_API_KEY
```
