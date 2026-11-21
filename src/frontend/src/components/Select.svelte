<script lang="ts">
  import { tick } from 'svelte';

  type SelectOption = { value: string; label: string };

  export let label: string;
  export let value: string;
  export let options: SelectOption[];
  export let id: string;
  export let className = '';
  export let onChange: (value: string) => void = () => {};

  let root: HTMLDivElement;
  let menuElement: HTMLDivElement;
  let selectedOption: SelectOption | undefined;
  let expanded = false;
  let activeIndex = 0;
  const viewportMargin = 8;
  let menuPosition = '';
  $: selectedOption = options.find((option) => option.value === value);

  function portal(node: HTMLDivElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  function focusOption(index: number) {
    activeIndex = (index + options.length) % options.length;
    menuElement?.querySelectorAll<HTMLButtonElement>('[role="option"]')[activeIndex]?.focus();
  }

  async function openMenu(index = Math.max(options.findIndex((option) => option.value === value), 0)) {
    expanded = true;
    activeIndex = index;
    await tick();
    const triggerBounds = root.querySelector<HTMLButtonElement>('[role="combobox"]')?.getBoundingClientRect();
    const menu = menuElement;
    if (triggerBounds && menu) {
      const minimumWidth = Math.min(triggerBounds.width, window.innerWidth - viewportMargin * 2);
      menuPosition = `left:${triggerBounds.left}px;top:${triggerBounds.bottom + 4}px;min-width:${minimumWidth}px`;
      await tick();
      const menuWidth = menu.getBoundingClientRect().width;
      const left = Math.max(viewportMargin, Math.min(triggerBounds.left, window.innerWidth - viewportMargin - menuWidth));
      menuPosition = `left:${left}px;top:${triggerBounds.bottom + 4}px;min-width:${minimumWidth}px`;
    }
    focusOption(activeIndex);
  }

  function closeMenu(restoreFocus = false) {
    expanded = false;
    if (restoreFocus) root.querySelector<HTMLButtonElement>('[role="combobox"]')?.focus();
  }

  function choose(option: SelectOption) {
    onChange(option.value);
    closeMenu(true);
  }

  function handleTriggerKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void openMenu();
    }
  }

  function handleOptionKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusOption(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusOption(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(options[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === 'Tab') {
      closeMenu();
    }
  }

  function handleOutsidePointer(event: PointerEvent) {
    const target = event.target as Node;
    if (expanded && !root.contains(target) && !menuElement?.contains(target)) closeMenu();
  }

  function handleFocusOut(event: FocusEvent) {
    const target = event.relatedTarget as Node | null;
    if (!root.contains(target) && !menuElement?.contains(target)) closeMenu();
  }
</script>

<svelte:window onpointerdown={handleOutsidePointer} />
<div bind:this={root} class={`select-control ${className}`} onfocusout={handleFocusOut}>
  <button id={id} type="button" class="select-trigger" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={expanded} aria-controls={`${id}-listbox`} onclick={() => expanded ? closeMenu() : void openMenu()} onkeydown={handleTriggerKeydown}>
    <span>{selectedOption?.label ?? value}</span><span class="select-arrow" aria-hidden="true"></span>
  </button>
  {#if expanded}
    <div use:portal bind:this={menuElement} id={`${id}-listbox`} class="select-menu" style={menuPosition} role="listbox" tabindex="-1" aria-label={label} onkeydown={handleOptionKeydown} onfocusout={handleFocusOut}>
      {#each options as option, index (option.value)}
        <button type="button" role="option" aria-selected={option.value === value} class:active={index === activeIndex} tabindex="-1" onclick={() => choose(option)} onmouseenter={() => activeIndex = index}>{option.label}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .select-control{position:relative;min-width:0;font:12px system-ui}
  .select-trigger{display:flex;align-items:center;justify-content:space-between;width:100%;height:var(--control-height,36px);padding:0 var(--control-padding-inline,10px);border:1px solid var(--control-border,var(--border-strong));border-radius:var(--control-radius,6px);background:var(--control-bg,var(--surface-bg));color:var(--control-text,var(--text-primary));font-size:var(--control-font-size,12px);text-align:left;cursor:pointer}
  .select-trigger:focus-visible,.select-menu button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .select-arrow{flex:0 0 auto;width:var(--control-arrow-size,7px);height:var(--control-arrow-size,7px);margin:0 2px 4px 12px;border-right:var(--control-arrow-stroke,1.5px) solid var(--text-subtle);border-bottom:var(--control-arrow-stroke,1.5px) solid var(--text-subtle);transform:rotate(45deg)}
  .select-menu{position:fixed;z-index:100;width:max-content;max-width:calc(100vw - 16px);max-height:var(--control-menu-max-height,240px);overflow:auto;padding:var(--control-menu-padding,5px);border:1px solid var(--control-border,var(--border-strong));border-radius:var(--control-radius,6px);background:var(--control-bg,var(--surface-bg));box-shadow:0 10px 28px #0008}
  .select-menu button{display:block;width:100%;padding:var(--control-option-padding,7px 9px);border:0;border-radius:4px;background:transparent;color:var(--text-secondary);text-align:left;white-space:normal;overflow-wrap:anywhere;font:inherit;cursor:pointer}
  .select-menu button:hover,.select-menu button:focus-visible,.select-menu button.active{background:var(--surface-hover-bg);color:var(--text-strong)}
  .select-menu button[aria-selected="true"]{color:var(--accent)}
</style>
