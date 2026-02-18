import { Show, type Component } from 'solid-js';
import { useAuth } from './auth/provider';
import { Login } from './auth/login';
import { Sidebar } from './sidebar';

export const App: Component = () => {
  const { isAuthed, logout } = useAuth();

  return (
    <>
      <Show when={!isAuthed()}>
        <Login />
      </Show>
      <Show when={isAuthed()}>
        <div class="flex">
          <Sidebar />
          <div class="p-4">
            <div>Authenticated</div>
            <button onClick={logout} class="button">Logout</button>
          </div>
        </div>
      </Show>
    </>
  )

  // if (!isAuthenticated()) {
  //   return <Login />;
  // }

  // return <div>Authenticated</div>;
};
