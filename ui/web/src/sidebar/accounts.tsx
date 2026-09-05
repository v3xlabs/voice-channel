import { BsPersonPlus, BsPeople } from "solid-icons/bs";
import { createMemo, createUniqueId, For } from "solid-js";
import { normalizeProps, useMachine } from "@zag-js/solid";
import * as menu from '@zag-js/menu';
import { useNavigate } from "@solidjs/router";
import { useAccounts } from "../auth/accounts";
import { Jid } from "../components/jid";

const ADD = 'add-account';

export const AccountMenu = () => {
    const { accounts, activeJid, setActive } = useAccounts();
    const navigate = useNavigate();

    const service = useMachine(menu.machine, {
        id: createUniqueId(),
        positioning: { placement: 'top-start' },
        onSelect: (e) => {
            if (e.value === ADD) {
                navigate('/accounts/add');
                return;
            }
            // Activating an account remounts the router, so the navigation must land first.
            navigate('/');
            setTimeout(() => setActive(e.value), 0);
        },
    });
    const api = createMemo(() => menu.connect(service, normalizeProps));

    return (
        <div>
            <button class="button button-tertiary aspect-square w-10 flex items-center justify-center"
                title="Accounts"
                {...api().getTriggerProps()}
            >
                <BsPeople />
            </button>
            <div {...api().getPositionerProps()}>
                <ul class="bg-neutral-800 border border-neutral-700 p-0.5 w-screen max-w-64 rounded-lg data-[focus]:outline-none focus:outline-none" {...api().getContentProps()}>
                    <For each={accounts()}>
                        {(account) => (
                            <li {...api().getItemProps({ value: account.jid.split('/')[0] ?? account.jid, closeOnSelect: true })}
                                class="menu-item"
                                classList={{ 'text-cyan-300': activeJid() === (account.jid.split('/')[0] ?? account.jid) }}
                            >
                                <Jid jid={account.jid} class="truncate" localClass="text-white" domainClass="opacity-90" />
                            </li>
                        )}
                    </For>
                    <li {...api().getItemProps({ value: ADD, closeOnSelect: true })} class="menu-item">
                        <BsPersonPlus />
                        Add account
                    </li>
                </ul>
            </div>
        </div>
    );
};
