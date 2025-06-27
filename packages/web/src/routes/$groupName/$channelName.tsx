import { createFileRoute } from '@tanstack/react-router'
import { Channel } from '../../pages/Channel'

export const Route = createFileRoute('/$groupName/$channelName')({
  component: Channel,
}) 