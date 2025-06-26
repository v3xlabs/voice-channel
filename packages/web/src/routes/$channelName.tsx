import { createFileRoute } from '@tanstack/react-router'
import { Channel } from '../pages/Channel'

export const Route = createFileRoute('/$channelName')({
  component: Channel,
}) 