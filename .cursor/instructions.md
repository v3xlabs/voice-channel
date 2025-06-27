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

## Federation Architecture

### Instance Structure

The system is designed around **instances** - independent deployments of the voice channel server. Each instance:

- Is hosted at a unique FQDN (Fully Qualified Domain Name)
- Manages its own users and channels
- Can federate with other instances
- Handles media routing for its channels

### Primary Instance

The primary hosted instance is at `https://voice.channel` and serves multiple roles:

1. **Frontend Host**: Serves the React frontend application
2. **Discovery Hub**: Helps users find channels across the federation
3. **Default Instance**: Hosts channels for users who don't run their own instances

### Cross-Instance Channel Access

Users can access channels on any federated instance through URL routing:

#### URL Format
```
https://voice.channel/{target-instance-fqdn}/{group-name}/{channel-name}
```

#### Examples
- Local admin channel: `https://voice.channel/general` (admin group)
- Local group channel: `https://voice.channel/mygroup/discussion`
- Remote channel: `https://voice.channel/v3x.vc/gaming/general`
- Another remote: `https://voice.channel/company.example.com/meetings/standup`

#### Behavior
1. **Frontend Routing**: The `voice.channel` frontend detects the target instance from the URL
2. **API Redirection**: All API calls are made directly to the target instance (`v3x.vc`)
3. **Media Routing**: WebRTC media flows directly through the target instance
4. **No Proxy**: The `voice.channel` server handles no media traffic for remote channels

### Media Routing Strategy

#### Local Channels
```
User A ←→ voice.channel ←→ User B
```

#### Remote Channels
```
User A (via voice.channel frontend) ←→ v3x.vc ←→ User B (via voice.channel frontend)
```

#### Cross-Instance Channels
```
User A (voice.channel) ←→ v3x.vc ←→ User B (company.com)
```

All media traffic flows through the instance hosting the channel, ensuring:
- Optimal latency
- Reduced bandwidth on proxy instances
- Simplified routing logic
- Better scalability

## Multi-Worker Architecture

### Instance Scaling

Each instance can scale horizontally using multiple **worker processes**:

#### Single-Node Deployment
```
Instance (v3x.vc)
└── Worker Process 1 (handles everything)
    ├── API Server
    ├── Mediasoup Workers
    └── Database
```

#### Multi-Node Deployment
```
Instance (v3x.vc)
├── Worker Process 1 (Load Balancer + API)
├── Worker Process 2 (Media Worker)
├── Worker Process 3 (Media Worker)
└── Worker Process N (Media Worker)
```

### Worker Authentication

Workers authenticate using a pre-configured environment variable:

```bash
# Shared across all workers in an instance
INSTANCE_AUTH_KEY=your-secret-key-here
```

### Kubernetes Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: voice-channel-workers
spec:
  replicas: 8  # Scale based on load
  template:
    spec:
      containers:
      - name: voice-channel
        image: voice-channel:latest
        env:
        - name: INSTANCE_AUTH_KEY
          valueFrom:
            secretKeyRef:
              name: voice-channel-secret
              key: auth-key
        - name: INSTANCE_FQDN
          value: "v3x.vc"
        - name: WORKER_TYPE
          value: "media"  # or "api" for load balancer
```

### Worker Types

#### API Worker (Load Balancer)
- Handles HTTP API requests
- Routes WebRTC signaling
- Manages channel/user metadata
- Coordinates with media workers

#### Media Worker
- Manages Mediasoup routers
- Handles WebRTC media routing
- Processes audio/video streams
- Reports capacity to API workers

### Load Distribution

```
Internet → API Worker (LB) → Media Worker Pool
                          ├── Media Worker 1 (Channels 1-10)
                          ├── Media Worker 2 (Channels 11-20)
                          └── Media Worker N (Channels X-Y)
```

## Deployment Scenarios

### Scenario 1: Personal Instance
```bash
# Single container, everything included
docker run -e INSTANCE_FQDN=my.domain.com voice-channel:latest
```

### Scenario 2: Production Instance
```bash
# Kubernetes cluster with 8 workers
kubectl apply -f voice-channel-deployment.yaml
```

### Scenario 3: Enterprise Instance
```bash
# Multi-region deployment with worker pools
# Workers in US-East, EU-West, Asia-Pacific
kubectl apply -f voice-channel-global.yaml
```

## Federation Discovery

### Instance Registry

Instances can optionally register with the primary instance for discovery:

```http
POST https://voice.channel/api/federation/register
{
  "fqdn": "v3x.vc",
  "name": "V3X Labs Voice",
  "description": "Community voice channels",
  "public": true
}
```

### Channel Discovery

Users can discover public channels across the federation:

```http
GET https://voice.channel/api/federation/channels
[
  {
    "instance": "voice.channel",
    "channels": ["general", "tech", "gaming"]
  },
  {
    "instance": "v3x.vc", 
    "channels": ["dev", "community"]
  }
]
```

## Federation

This software needs to be able to run with multiple instance of the same software.
Ideally anyone can spin up a process of the server, and choose to host one or multiple instances of "channels".

Each server process keeps track of the channels its hosting, and an instance can be directed at other instances to share their channel list.

A url for a voice channel at an instance would be something like:

```
https://voice.channel/v3x.vc/gaming/irc
```

Where `voice.channel` is the domain of any instance (in this case the globally hosted instance), `v3x.vc` is the FQDN of the instance hosting the channel, `gaming` is the group name, and `irc` is the channel name.

When referring to a channel on the current instance, it is possible to use the following url:

```
https://voice.channel/gaming/irc
```

For channels in the special "admin" group, the group name can be omitted:

```
https://voice.channel/general
```

## User Experience Design

### Channel Concepts

The system distinguishes between two important concepts:

1. **Channel Membership** - Subscribing to a channel for text chat and notifications
   - Shows the channel in your sidebar as `#groupname/channelname` or `#channelname` for admin group
   - Allows reading and sending text messages
   - Persists across sessions
   - Does NOT automatically put you in voice calls

2. **Voice Call Participation** - Actively joining the voice/video call in a channel
   - Requires explicit "Join Call" action
   - Shows video grid interface with participants
   - Can be left without leaving the channel membership
   - Temporary - ends when you leave the call

### User Flow

```
1. Discover Channels → Join Channel → Channel appears in sidebar
2. Click channel in sidebar → See text chat interface
3. Click "Join Call" button → Enter voice/video call
4. Click "Leave Call" button → Return to text chat (still member)
```

### Interface States

#### Channel Page - Text Mode (Default)
- Welcome message and channel description
- Text message history (future implementation)
- Message input field
- Prominent "Join Call" button in header
- Shows who is currently in voice call (if any)

#### Channel Page - Voice Call Mode
- Video grid with participant tiles
- Audio/video controls (mute, camera, etc.)
- "Leave Call" button in header
- Real-time participant indicators

### Admin Panel

Accessible at `/admin` for users with admin permissions:
- Instance settings management
- User management and permissions
- Group management
- Channel management
- Invitation system
- Federation settings

### Settings Panel

Accessible at `/settings` for all users:
- Personal profile settings
- Notification preferences
- Logout functionality
- Admin panel link (for admins)

## Implementation Priorities

### Phase 1: Core Features ✅
- [x] User authentication with passkey support
- [x] Channel membership system
- [x] Sidebar navigation with joined channels
- [x] Text chat interface (UI ready)
- [x] Explicit voice call joining/leaving
- [x] WebRTC infrastructure (simulated)
- [x] Admin system with invitations

### Phase 2: Real-Time Features
- [ ] Text chat implementation (WebSocket/SSE)
- [ ] Real mediasoup integration
- [ ] Message persistence and history
- [ ] Typing indicators and presence
- [ ] Push notifications for mentions

### Phase 3: Multi-Worker Scaling
- [ ] Worker authentication
- [ ] Load balancing
- [ ] Worker coordination
- [ ] Horizontal scaling

### Phase 4: Federation
- [ ] Cross-instance API calls
- [ ] Instance discovery
- [ ] Frontend routing for remote channels
- [ ] Federation registry

### Phase 5: Production
- [ ] Monitoring & metrics
- [ ] Rate limiting
- [ ] Security hardening
- [ ] Performance optimization

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
