import { Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { Channel } from './pages/Channel'
import { Layout } from './components/Layout'

const App: React.FC = () => {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/:instanceFqdn/:channelName" element={<Channel />} />
        <Route path="/:channelName" element={<Channel />} />
      </Routes>
    </Layout>
  )
}

export default App 