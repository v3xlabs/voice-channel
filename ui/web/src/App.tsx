import { ParentComponent, Show, type Component } from 'solid-js';
import { useAuth } from './auth/provider';
import { useAccounts } from './auth/accounts';
import { Login, XMPPLoginForm } from './auth/login';
import { Sidebarred } from './sidebar';
import { Route, useNavigate } from '@solidjs/router';
import { ServerOverviewRoute } from './routes/server';
import { ServerChannelRoute } from './routes/server/channel';
import { MessagesRoute } from './routes/messages';
import { AdminRoute } from './routes/admin';
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

const AddAccountRoute: Component = () => {
  const navigate = useNavigate();
  return (
    <div class="p-2 w-full max-w-md mx-auto pt-10">
      <div class="card space-y-6">
        <h1 class="text-center font-bold text-xl">Add an account</h1>
        <XMPPLoginForm onDone={() => navigate('/')} />
      </div>
    </div>
  );
};

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

/** Rendered only while an account is active, so the auth context exists. */
const AccountApp: Component = () => {
  const { isAuthed, isConnecting, isBootstrapping } = useAuth();
  const showSplash = () => !isAuthed() && (isConnecting() || isBootstrapping());

  return (
    <>
      <Show when={showSplash()}>
        <SplashScreen />
      </Show>
      <Route path="/" component={Shell}>
        <Route path="/" component={Home} />
        <Route path="/messages" component={MessagesRoute} />
        <Route path="/accounts/add" component={AddAccountRoute} />
        <Route path="/admin" component={AdminRoute} />
        <Route path="/server/:groupId" component={ServerOverviewRoute} />
        <Route path="/server/:groupId/:channelId" component={ServerChannelRoute} />
      </Route>
    </>
  );
};

export const App: Component = () => {
  const { active } = useAccounts();

  return (
    <Show when={active()} fallback={<Route path="*" component={Login} />}>
      <AccountApp />
    </Show>
  )
};
