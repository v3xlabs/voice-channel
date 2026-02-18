import { JSX, createEffect, createMemo, createSignal, For, onCleanup, onMount } from "solid-js";

type MenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

type PopoverMenuProps = {
  /** Visible button label (or provide `button` for custom JSX). */
  label?: string;
  /** Custom button contents. */
  button?: JSX.Element;
  /** Menu items. */
  items: MenuItem[];
  /** Optional id base for aria attributes. */
  id?: string;
  /** Optional class names. */
  class?: string;
};

/**
 * SolidJS Popover Menu (ARIA-compliant-ish baseline)
 * - Button: aria-haspopup="menu", aria-expanded, aria-controls
 * - Menu: role="menu", items role="menuitem"
 * - Keyboard: Enter/Space/ArrowDown opens; Arrow keys/Home/End navigate; Escape closes; Tab closes
 * - Focus management: roving focus among menu items; returns focus to button on close
 * - Dismiss: click outside, Escape, Tab, resize/scroll (optional)
 */
export function PopoverMenu(props: PopoverMenuProps) {
  const baseId = createMemo(() => props.id ?? `pm-${Math.random().toString(36).slice(2)}`);
  const buttonId = createMemo(() => `${baseId()}-button`);
  const menuId = createMemo(() => `${baseId()}-menu`);

  const [open, setOpen] = createSignal(false);
  const [activeIndex, setActiveIndex] = createSignal<number>(-1);

  let buttonEl: HTMLButtonElement | undefined;
  let menuEl: HTMLDivElement | undefined;
  const itemEls: Array<HTMLDivElement | undefined> = [];

  const enabledIndices = createMemo(() =>
    props.items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => !it.disabled)
      .map(({ idx }) => idx)
  );

  function firstEnabledIndex() {
    const arr = enabledIndices();
    return arr.length ? arr[0] : -1;
  }
  function lastEnabledIndex() {
    const arr = enabledIndices();
    return arr.length ? arr[arr.length - 1] : -1;
  }
  function nextEnabledIndex(from: number) {
    const arr = enabledIndices();
    if (!arr.length) return -1;
    const pos = arr.indexOf(from);
    if (pos === -1) return arr[0];
    return arr[(pos + 1) % arr.length];
  }
  function prevEnabledIndex(from: number) {
    const arr = enabledIndices();
    if (!arr.length) return -1;
    const pos = arr.indexOf(from);
    if (pos === -1) return arr[arr.length - 1];
    return arr[(pos - 1 + arr.length) % arr.length];
  }

  function focusItem(idx: number) {
    setActiveIndex(idx);
    queueMicrotask(() => itemEls[idx]?.focus());
  }

  function openMenu(focus: "first" | "last" | "none" = "first") {
    setOpen(true);
    queueMicrotask(() => {
      if (focus === "none") return;
      const idx = focus === "first" ? firstEnabledIndex() : lastEnabledIndex();
      if (idx !== -1) focusItem(idx);
      else menuEl?.focus(); // fallback
    });
  }

  function closeMenu(returnFocus = true) {
    setOpen(false);
    setActiveIndex(-1);
    if (returnFocus) queueMicrotask(() => buttonEl?.focus());
  }

  function toggleMenu() {
    if (open()) closeMenu(false);
    else openMenu("first");
  }

  function onButtonKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        open() ? focusItem(nextEnabledIndex(activeIndex() === -1 ? firstEnabledIndex() : activeIndex())) : openMenu("first");
        break;
      case "ArrowUp":
        e.preventDefault();
        open() ? focusItem(prevEnabledIndex(activeIndex() === -1 ? lastEnabledIndex() : activeIndex())) : openMenu("last");
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        open() ? closeMenu(false) : openMenu("first");
        break;
      case "Escape":
        if (open()) {
          e.preventDefault();
          closeMenu(true);
        }
        break;
    }
  }

  function onMenuKeyDown(e: KeyboardEvent) {
    const idx = activeIndex();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusItem(nextEnabledIndex(idx === -1 ? firstEnabledIndex() : idx));
        break;
      case "ArrowUp":
        e.preventDefault();
        focusItem(prevEnabledIndex(idx === -1 ? lastEnabledIndex() : idx));
        break;
      case "Home":
        e.preventDefault();
        if (firstEnabledIndex() !== -1) focusItem(firstEnabledIndex());
        break;
      case "End":
        e.preventDefault();
        if (lastEnabledIndex() !== -1) focusItem(lastEnabledIndex());
        break;
      case "Escape":
        e.preventDefault();
        closeMenu(true);
        break;
      case "Tab":
        // Let focus move, but close the menu
        closeMenu(false);
        break;
      case "Enter":
      case " ":
        // Activate current item
        if (idx >= 0) {
          e.preventDefault();
          const item = props.items[idx];
          if (!item?.disabled) {
            item.onSelect();
            closeMenu(true);
          }
        }
        break;
    }
  }

  function onItemClick(idx: number) {
    const item = props.items[idx];
    if (item.disabled) return;
    item.onSelect();
    closeMenu(true);
  }

  function onDocumentPointerDown(ev: PointerEvent) {
    if (!open()) return;
    const t = ev.target as Node | null;
    if (!t) return;
    const insideButton = !!buttonEl && buttonEl.contains(t);
    const insideMenu = !!menuEl && menuEl.contains(t);
    if (!insideButton && !insideMenu) closeMenu(false);
  }

  // Simple positioning: place menu under button, left-aligned; clamp to viewport.
  function positionMenu() {
    if (!open() || !buttonEl || !menuEl) return;
    const btn = buttonEl.getBoundingClientRect();
    const menu = menuEl.getBoundingClientRect();
    const margin = 8;

    let left = btn.left;
    let top = btn.bottom + margin;

    // clamp horizontally
    left = Math.max(margin, Math.min(left, window.innerWidth - menu.width - margin));
    // if overflow bottom, try above
    if (top + menu.height + margin > window.innerHeight) {
      const above = btn.top - margin - menu.height;
      if (above >= margin) top = above;
    }

    // Use fixed so it doesn't depend on parent layout; avoids scroll container issues.
    menuEl.style.position = "fixed";
    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${top}px`;
    menuEl.style.minWidth = `${Math.max(btn.width, 160)}px`;
    menuEl.style.zIndex = "1000";
  }

  createEffect(() => {
    if (open()) queueMicrotask(positionMenu);
  });

  onMount(() => {
    document.addEventListener("pointerdown", onDocumentPointerDown, { capture: true });
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    onCleanup(() => {
      document.removeEventListener("pointerdown", onDocumentPointerDown, { capture: true } as any);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    });
  });

  return (
    <div class={props.class} style={{ display: "inline-block" }}>
      <button
        ref={(el) => (buttonEl = el)}
        id={buttonId()}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open()}
        aria-controls={open() ? menuId() : undefined}
        onClick={() => toggleMenu()}
        onKeyDown={(e) => onButtonKeyDown(e as KeyboardEvent)}
        style={{
          "border-radius": "10px",
          border: "1px solid rgba(0,0,0,0.15)",
          padding: "10px 12px",
          "background-color": "white",
          "box-shadow": "0 1px 2px rgba(0,0,0,0.06)",
          cursor: "pointer",
          "font-size": "14px",
          "line-height": "1",
        }}
      >
        {props.button ?? props.label ?? "Menu"}
        <span aria-hidden="true" style={{ "margin-left": "8px" }}>
          ▾
        </span>
      </button>

      {open() && (
        <div
          ref={(el) => (menuEl = el)}
          id={menuId()}
          role="menu"
          aria-labelledby={buttonId()}
          tabIndex={-1}
          onKeyDown={(e) => onMenuKeyDown(e as KeyboardEvent)}
          style={{
            "border-radius": "12px",
            border: "1px solid rgba(0,0,0,0.12)",
            "background-color": "white",
            "box-shadow": "0 10px 30px rgba(0,0,0,0.12)",
            padding: "6px",
            "user-select": "none",
          }}
        >
          <For each={props.items}>
            {(item, idxAcc) => {
              const idx = idxAcc();
              const disabled = !!item.disabled;

              return (
                <div
                  ref={(el) => (itemEls[idx] = el)}
                  role="menuitem"
                  tabIndex={activeIndex() === idx ? 0 : -1}
                  aria-disabled={disabled ? "true" : undefined}
                  onPointerMove={() => {
                    if (!disabled && activeIndex() !== idx) setActiveIndex(idx);
                  }}
                  onFocus={() => setActiveIndex(idx)}
                  onClick={() => onItemClick(idx)}
                  style={{
                    padding: "10px 10px",
                    "border-radius": "10px",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.45 : 1,
                    outline: "none",
                    "font-size": "14px",
                    "line-height": "1.1",
                    "background-color": activeIndex() === idx ? "rgba(0,0,0,0.06)" : "transparent",
                  }}
                >
                  {item.label}
                </div>
              );
            }}
          </For>
        </div>
      )}
    </div>
  );
}
