import { ParentComponent, Show, type Component } from 'solid-js';
import { useAuth } from './auth/provider';
import { Login } from './auth/login';
import { Sidebarred } from './sidebar';
import { Route } from '@solidjs/router';
import { ServerOverviewRoute } from './routes/server';
import { ServerChannelRoute } from './routes/server/channel';
import { MessagesRoute } from './routes/messages';

const Home = () => {
  return (
    <div class="p-4">Home</div>
  )
};


const Shell: ParentComponent = (props) => {
  return (
    <Sidebarred>
      {props.children}
    </Sidebarred>
  )
}

export const App: Component = () => {
  const { isAuthed, isConnecting, isBootstrapping } = useAuth();
  const showLogin = () => !isAuthed() && !isConnecting() && !isBootstrapping();

  return (
    <>
      <Show when={showLogin()}>
        <Route path="*" component={Login} />
      </Show>
      <Show when={!showLogin()}>
        <Route path="/" component={Shell}>
          <Route path="/" component={Home} />
          <Route path="/messages" component={MessagesRoute} />
          <Route path="/server/:groupId" component={ServerOverviewRoute} />
          <Route path="/server/:groupId/:channelId" component={ServerChannelRoute} />
        </Route>
      </Show>
    </>
  )

  // if (!isAuthenticated()) {
  //   return <Login />;
  // }

  // return <div>Authenticated</div>;
};
