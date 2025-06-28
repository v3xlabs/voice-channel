# Project Reference

Hello, this is the project reference for the voice channel project.
This project aims to establish a fair, simple, and reliable voice, video, and screen sharing system.
Users can join a channel and talk, turn on their webcam, share their screen, and more.

## Technology Stack

Use free and open source software.
This project will most likely be running in a kubernetes cluster, and will require some form of between instance communication. Such that if we scale up the number of instances the users can still communicate with each other.

- server
  - poem
  - poem_openapi
  - sqlx
  - docker compose for dev environment
- web
  - pnpm
  - react
  - typescript
  - tailwind
  - vite
  - radix-ui
  - tanstack query
  - tanstack router
  - openapi-typescript (to generate types from schema)
  - openapi-hooks (package that lets you wrap openapi schema)

### Web

The web app is a react app that uses the openapi schema generated when the `pnpm dev` command is run.
It then uses `openapi-hooks` to wrap the openapi schema and turn it into a usable fetch-like function that can be used within tanstack query hooks.

### Server

The server should use poem and poem_openapi for the api.
The openapi.json should be exposed at `/openapi.json` the docs available at `/docs` and the api at `/api`.

Use scalar for the documentation. It can be imported using include_str!("docs.html")

With regards to repository setup look at the https://github.com/v3xlabs/ethereum-forum/blob/master/app/src/server/index.html as a reference.

### Mediasoup

https://mediasoup.org/documentation/overview/

Should give us the ability to easily route audio and video back and forth.

### WebRTC

This project utalizes WebRTC for audio and video communication.
Most likely all WebRTC connections will need to be relayed through a server.

## Terminology

### Instance

An instance is a server (potentially multiple) that are hosted on a single domain.
An instance is identified by its FQDN. For example `voice.channel` is the FQDN of the globally hosted instance. Other examples of instances are `v3x.vc` and `example.com`.

### Group

Groups can be created by users provided they have the permissions to do so.
Admin's are by default a member of the `admin` group and can create channels under this group.

Group IDs should be `([a-z0-9]-?[a-z0-9])+` and should be unique across the current instance.

Regex: `([a-z0-9]-?[a-z0-9])+`
Examples: `my-group`, `mygroup`, `v3x`, `rss`, `irc`

### Channel

A channel is a text chat channel that has an optional "room" voice call that can be joined at any time by any member of the channel.
Its kind of like a discord text & voice channel in one.

All voice channels belong to a group.
Groups can be used to distinguish between channels with the same name on the same instance.

For example `mygroup` can have a `hello` channel and `mygroupB` can also have a `hello` channel.

When an admin is creating a channel they cannot name it `admin` or `settings` as this could cause url conflicts.

#### Creating a channel

Channels can be created by anyone on an instance with the permissions to do so.
Permissions for channel creation are defined on an instance level.
By default only admins can create channels. However in the settings in the settings it can be adjusted instance wide as well as per user.

#### Joining a channel

Joining a channel is done by clicking the "Join" button on a channel.
To be able to view a channel the user needs to be a member of the channel.
Joining a channel can be done from any instance, however subscription to the channel is managed by the instance the user is currently on.

So if the user is currently on `voice.channel` and they join a channel on `v3x.vc` their subscription will be stored by the `voice.channel` database, however the users requests will be sent directly to `v3x.vc` instead. This means the user can lookup their "subscriptions" from their default instance, and the frontend will connect to the appropriate instance for each channel.

Depending on the channel the user can join immediately or they will need a direct invite from someone. If a channel is public someone should be able to visit the url and click join to become a member. Otherwise it should show a message that an invite is required.

#### Joining a room

Joining a room is the terminology for once a user has joined a channel they can join the room.
The room is the voice call that is associated with this channel.
From the user perspective the room and channel are the same thing.
The term "room" should not be used in the frontend visible to the user to avoid confusion.

#### Channel Discovery

As an extra but completely optional feature in the frontend sidebar is the "discover" tab.
This tab allows users to see the channels available on the current instance.

#### Channel Sorting

On the sidebar in the frontend we should sort the channels the user is a member of;
Prioritize channels that have active room's sorted by participant count.
Then sort the rest of the channels by the last message sent timestamp, prioritizing unread messages.

Keep track of what messages have been read by keeping track of the "last_read_message_id" for each channel for each user on the user's instance.

#### Channel URL

```sh
# User is on voice.channel, but connected to v3x.vc, `mygroup/irc`
https://voice.channel/v3x.vc/mygroup/irc

# User is on voice.channel, connected to voice.channel, `mygroup/irc`
https://voice.channel/mygroup/irc

# User is on voice.channel, connected to voice.channel, `rss` of group `admin`
https://voice.channel/rss
```

### Reserved URLs

The following URLs are reserved for the web application:

- `/settings` - User settings panel (includes logout, profile settings, admin link for admins)
- `/admin` - Admin panel (only accessible to users with admin permissions)
