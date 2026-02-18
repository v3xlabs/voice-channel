import { createEffect, ParentComponent, Show, type Component } from 'solid-js';
import { useAuth } from './auth/provider';
import { Login } from './auth/login';
import { Sidebar, Sidebarred } from './sidebar';
import { Route, Router, RouteSectionProps } from '@solidjs/router';
import { ServerOverviewRoute } from './routes/server';

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
  const { isAuthed, logout } = useAuth();

  return (
    <>
      <Show when={!isAuthed()}>
        <Route path="*" component={Login} />
      </Show>
      <Show when={isAuthed()}>
        <Route path="/" component={Shell}>
          <Route path="/" component={Home} />
          <Route path="/server/:groupId" component={ServerOverviewRoute} />
        </Route>
      </Show>
    </>
  )

  // if (!isAuthenticated()) {
  //   return <Login />;
  // }

  // return <div>Authenticated</div>;
};
