import { createFileRoute } from '@tanstack/react-router'
import { Channel } from '../../../pages/Channel'

export const Route = createFileRoute('/$instanceFqdn/$groupName/$channelName')({
  component: Channel,
}) 