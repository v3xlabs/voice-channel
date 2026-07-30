import { ParentComponent, Show, type Component } from 'solid-js';
import { useAuth } from './auth/provider';
import { Login } from './auth/login';
import { Sidebarred } from './sidebar';
import { Route } from '@solidjs/router';
import { ServerOverviewRoute } from './routes/server';
import { ServerChannelRoute } from './routes/server/channel';
import { MessagesRoute } from './routes/messages';
import { BsArrowRepeat } from 'solid-icons/bs';

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

const SplashScreen = () => {
  return (
    <div class="w-full h-screen bg-neutral-900 flex items-center justify-center">
      <div class="text-center space-y-4">
        <img src="/logo.svg" alt="Voice Channel" class="w-10 h-10 mx-auto animate-pulse" />
        <p class="text-neutral-400 text-sm flex items-center gap-2 justify-center">
          <BsArrowRepeat class="animate-spin" />
          Connecting...
        </p>
      </div>
    </div>
  );
};

export const App: Component = () => {
  const { isAuthed, isConnecting, isBootstrapping } = useAuth();
  const showLogin = () => !isAuthed() && !isConnecting() && !isBootstrapping();
  const showSplash = () => !isAuthed() && (isConnecting() || isBootstrapping());

  return (
    <>
      <Show when={showSplash()}>
        <SplashScreen />
      </Show>
      <Show when={showLogin()}>
        <Route path="*" component={Login} />
      </Show>
      <Show when={isAuthed()}>
        <Route path="/" component={Shell}>
          <Route path="/" component={Home} />
          <Route path="/messages" component={MessagesRoute} />
          <Route path="/server/:groupId" component={ServerOverviewRoute} />
          <Route path="/server/:groupId/:channelId" component={ServerChannelRoute} />
        </Route>
      </Show>
    </>
  )
};
