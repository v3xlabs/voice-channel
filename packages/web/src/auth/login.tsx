import type { Component } from "solid-js";
import { useAuth } from "./provider";

export const Login: Component = () => {
    const { login } = useAuth();

    const handleLogin = () => {
        console.log('login');
        login('123');
    };

    return (
        <div class="w-full h-screen bg-neutral-900">
            <div class="p-2 w-full max-w-md mx-auto pt-10">
                <div class="card space-y-4">
                    <h1>Welcome to my cute login screen</h1>
                    <button onClick={handleLogin} class="button w-full">Login</button>
                </div>
            </div>
        </div>
    );
};
