// import { createSignal } from "solid-js";
// import logo from "./assets/logo.svg";
// import { invoke } from "@tauri-apps/api/core";
// import "./App.css";

// function App() {
//   const [greetMsg, setGreetMsg] = createSignal("");
//   const [name, setName] = createSignal("");

//   async function greet() {
//     // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
//     setGreetMsg(await invoke("greet", { name: name() }));
//   }

//   return (
//     <main class="container">
//       <h1>Welcome to Tauri + Solid</h1>

//       <div class="row">
//         <a href="https://vite.dev" target="_blank">
//           <img src="/vite.svg" class="logo vite" alt="Vite logo" />
//         </a>
//         <a href="https://tauri.app" target="_blank">
//           <img src="/tauri.svg" class="logo tauri" alt="Tauri logo" />
//         </a>
//         <a href="https://solidjs.com" target="_blank">
//           <img src={logo} class="logo solid" alt="Solid logo" />
//         </a>
//       </div>
//       <p>Click on the Tauri, Vite, and Solid logos to learn more.</p>

//       <form
//         class="row"
//         onSubmit={(e) => {
//           e.preventDefault();
//           greet();
//         }}
//       >
//         <input
//           id="greet-input"
//           onChange={(e) => setName(e.currentTarget.value)}
//           placeholder="Enter a name..."
//         />
//         <button type="submit">Greet</button>
//       </form>
//       <p>{greetMsg()}</p>
//     </main>
//   );
// }

// export default App;
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
