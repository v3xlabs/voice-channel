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

### Mediasoup

https://mediasoup.org/documentation/overview/

Should give us the ability to easily route audio and video back and forth.

### WebRTC

This project utalizes WebRTC for audio and video communication.
Most likely all WebRTC connections will need to be relayed through a server.

## Federation

This software needs to be able to run with multiple instance of the same software.
Ideally anyone can spin up a process of the server, and choose to host one or multiple instances of "channels".

Each server process keeps track of the channels its hosting, and an instance can be directed at other instances to share their channel list.

A url for a voice channel at an instance would be something like:

```
http://voice.channel/v3x.vc#irc
```

Where `voice.channel` is the domain of any instance (in this case the globally hosted instance) and `v3x.vc` is the FQDN of the instance hosting the channel. `irc` is the channel name.

When referring to a channel on the current instance, it is possible to use the following url:

```
http://voice.channel/#irc
```

