import { useSearchParams } from "@solidjs/router";
import { Component, createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { useAuth } from "../auth/provider";
import { Jid } from "../components/jid";
import { Avatar } from "../components/avatar";

export const MessagesRoute: Component = () => {
    const {
        privateChats,
        loadLatestMessages,
        loadOlderMessages,
        hasOlderMessages,
        markConversationRead,
        messagesFor,
        sendChat,
    } = useAuth();
    const [search] = useSearchParams<{ chat?: string }>();
    const [draft, setDraft] = createSignal('');
    const [isLoadingOlder, setIsLoadingOlder] = createSignal(false);
    const [stickToBottom, setStickToBottom] = createSignal(true);
    let messageScrollRef: HTMLDivElement | undefined;

    const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
        if (!messageScrollRef) return;
        messageScrollRef.scrollTo({ top: messageScrollRef.scrollHeight, behavior });
    };

    const isNearBottom = () => {
        if (!messageScrollRef) return true;
        const distance = messageScrollRef.scrollHeight - (messageScrollRef.scrollTop + messageScrollRef.clientHeight);
        return distance < 72;
    };

    const activeChat = createMemo(() => {
        if (search.chat) return search.chat;
        return privateChats()[0]?.jid || '';
    });

    const activeMessages = createMemo(() => {
        const jid = activeChat();
        if (!jid) return [];
        return messagesFor(jid);
    });

    const activeSummary = createMemo(() => {
        const jid = activeChat();
        return privateChats().find((chat) => chat.jid === jid);
    });

    createEffect((previousJid) => {
        const jid = activeChat();
        if (!jid || jid === previousJid) return jid;

        setStickToBottom(true);
        void loadLatestMessages(jid, 30).then(() => {
            markConversationRead(jid);
            requestAnimationFrame(() => scrollToBottom('auto'));
        });

        return jid;
    });

    createEffect(() => {
        const jid = activeChat();
        const count = activeMessages().length;
        if (!jid || count === 0) return;

        if (isNearBottom() || stickToBottom()) {
            requestAnimationFrame(() => scrollToBottom('auto'));
        }

        markConversationRead(jid);
    });

    const loadOlder = async () => {
        const jid = activeChat();
        if (!jid || isLoadingOlder() || !messageScrollRef) return;

        const previousHeight = messageScrollRef.scrollHeight;
        const previousTop = messageScrollRef.scrollTop;

        setIsLoadingOlder(true);
        try {
            await loadOlderMessages(jid, 30);
            requestAnimationFrame(() => {
                if (!messageScrollRef) return;
                const nextHeight = messageScrollRef.scrollHeight;
                messageScrollRef.scrollTop = previousTop + (nextHeight - previousHeight);
            });
        } finally {
            setIsLoadingOlder(false);
        }
    };

    const handleSend = () => {
        const jid = activeChat();
        if (!jid) return;
        const body = draft().trim();
        if (!body) return;
        sendChat(jid, body);
        setDraft('');
    };

    return (
        <div class="w-full h-screen flex bg-neutral-900">
            <div class="flex-1 flex flex-col">
                <div class="border-b border-neutral-800 px-4 py-3">
                    <Show when={activeChat()} fallback={<span class="text-neutral-400">Select a chat from the sidebar</span>}>
                        <div class="flex items-center gap-2">
                            <Avatar jid={activeSummary()?.jid} name={activeSummary()?.name} src={activeSummary()?.avatarUrl} size={28} />
                            <div>
                                <Jid jid={activeChat()} class="font-medium" localClass="text-white" domainClass="opacity-90" />
                                <p class="text-xs text-neutral-400">{activeSummary()?.statusText || activeSummary()?.presence || 'offline'}</p>
                            </div>
                        </div>
                    </Show>
                </div>

                <div
                    ref={messageScrollRef}
                    class="flex-1 overflow-y-auto p-4"
                    onScroll={(e) => {
                        const target = e.currentTarget;
                        const distance = target.scrollHeight - (target.scrollTop + target.clientHeight);
                        setStickToBottom(distance < 72);
                        if (target.scrollTop < 120 && hasOlderMessages(activeChat())) {
                            void loadOlder();
                        }
                    }}
                >
                    <Show when={activeChat()} fallback={<p class="text-neutral-500">Choose a private chat to view messages.</p>}>
                        <div class="min-h-full flex flex-col justify-end gap-2">
                            <Show when={hasOlderMessages(activeChat())}>
                                <div class="w-full flex justify-center pb-2">
                                    <button class="button button-tertiary" disabled={isLoadingOlder()} onClick={loadOlder}>
                                        {isLoadingOlder() ? 'Loading...' : 'Load older messages'}
                                    </button>
                                </div>
                            </Show>
                            <For each={activeMessages()}>
                                {(message) => (
                                    <div
                                        class="max-w-[70%] rounded-md px-3 py-2 text-sm"
                                        classList={{
                                            "bg-cyan-700": message.direction === 'out',
                                            "bg-neutral-800": message.direction === 'in',
                                        }}
                                    >
                                        <p>{message.body}</p>
                                        <p class="text-[11px] text-neutral-300 mt-1">
                                            {new Date(message.timestamp).toLocaleTimeString()} {message.encryption !== 'none' ? `- ${message.encryption}` : ''}
                                        </p>
                                    </div>
                                )}
                            </For>
                        </div>
                    </Show>
                </div>

                <Show when={activeChat()}>
                    <div class="border-t border-neutral-800 p-3 flex gap-2">
                        <input
                            type="text"
                            value={draft()}
                            onInput={(e) => setDraft(e.currentTarget.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSend();
                            }}
                            class="flex-1 rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2"
                            placeholder="Type a message"
                        />
                        <button class="button" onClick={handleSend}>Send</button>
                    </div>
                </Show>
            </div>
        </div>
    );
};
