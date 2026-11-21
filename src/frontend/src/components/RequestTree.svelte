<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { RequestNode } from '../workspace-api';
  import { locale, translate } from '../i18n';

  export let collections: RequestNode[] = [];
  export let selectedID = '';

  function ancestorIDs(nodes: RequestNode[], targetID: string, ancestors: string[] = []): string[] | null {
    for (const node of nodes) {
      if (node.id === targetID) return ancestors;
      const result = ancestorIDs(node.children ?? [], targetID, [...ancestors, node.id]);
      if (result) return result;
    }
    return null;
  }

  function revealSelectedNode(targetID: string, nodes: RequestNode[], collapsed: Set<string>) {
    if (!targetID) return;
    const ancestors = ancestorIDs(nodes, targetID);
    if (!ancestors?.some((id) => collapsed.has(id))) return;
    collapsedIDs = new Set([...collapsed].filter((id) => !ancestors.includes(id)));
  }

  $: revealSelectedNode(selectedID, collections, collapsedIDs);
  export let onSelect: (node: RequestNode) => void = () => {};
  export let onSelectCollection: (node: RequestNode) => void = () => {};
  export let onRename: (node: RequestNode) => void = () => {};
  export let onAddRequest: (node: RequestNode) => void = () => {};
  export let onAddFolder: (node: RequestNode) => void = () => {};
  export let onRun: (node: RequestNode) => void = () => {};
  export let onGenerateCode: (node: RequestNode) => void = () => {};
  export let onDuplicate: (node: RequestNode) => void = () => {};
  export let onMove: (node: RequestNode) => void = () => {};
  export let onReorder: (id: string, direction: 'up' | 'down') => void = () => {};
  export let onDropNode: (node: RequestNode, destination: RequestNode, position: 'before' | 'after' | 'inside') => void = () => {};
  let dropTarget = '';
  let dropPosition: 'before' | 'after' | 'inside' = 'inside';
  const dropEdgeFraction = 0.25;

  function startDrag(event: DragEvent, node: RequestNode) {
    draggedNode = node;
    event.dataTransfer?.setData('text/plain', node.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function dragOver(event: DragEvent, node: RequestNode) {
    if (!draggedNode || draggedNode.id === node.id || visit([draggedNode]).some((row) => row.node.id === node.id)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const fraction = (event.clientY - bounds.top) / bounds.height;
    dropPosition = node.kind === 'collection' ? 'inside' : fraction < dropEdgeFraction ? 'before' : fraction > 1 - dropEdgeFraction ? 'after' : node.kind === 'request' ? 'after' : 'inside';
    dropTarget = node.id;
  }

  function drop(event: DragEvent, node: RequestNode) {
    event.preventDefault();
    if (draggedNode && dropTarget === node.id) onDropNode(draggedNode, node, dropPosition);
    draggedNode = null;
    dropTarget = '';
  }
  let draggedNode: RequestNode | null = null;
  export let onDelete: (id: string) => void = () => {};

  let openActionsID = '';

  onMount(() => {
    const closeOutside = (event: PointerEvent) => {
      if (openActionsID && (!(event.target instanceof Element) || !event.target.closest('.tree-row.menu-open'))) openActionsID = '';
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  });
  let collapsedIDs = new Set<string>();
  function toggleExpanded(id: string) { const next = new Set(collapsedIDs); if (next.has(id)) next.delete(id); else next.add(id); collapsedIDs = next; }
  let menuPosition = { left: 0, top: 0 };

  const menuTriggerGap = 4;
  const menuViewportMargin = 8;

  function visit(nodes: RequestNode[], depth = 0, collapsed = collapsedIDs): Array<{ node: RequestNode; depth: number }> {
    return nodes.flatMap((node) => [{ node, depth }, ...(collapsed.has(node.id) ? [] : visit(node.children ?? [], depth + 1, collapsed))]);
  }

  async function toggleActions(event: MouseEvent, nodeID: string) {
    if (openActionsID === nodeID) {
      openActionsID = '';
      return;
    }

    const triggerBounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    openActionsID = nodeID;
    menuPosition = { left: triggerBounds.right, top: triggerBounds.bottom + menuTriggerGap };
    await tick();

    const menu = document.querySelector<HTMLElement>('.tree-actions-panel');
    if (!menu) return;

    const { width, height } = menu.getBoundingClientRect();
    const maximumLeft = window.innerWidth - width - menuViewportMargin;
    const left = Math.max(menuViewportMargin, Math.min(triggerBounds.right - width, maximumLeft));
    const maximumTop = window.innerHeight - height - menuViewportMargin;
    const belowTop = triggerBounds.bottom + menuTriggerGap;
    const top = belowTop <= maximumTop
      ? belowTop
      : Math.max(menuViewportMargin, triggerBounds.top - height - menuTriggerGap);
    menuPosition = { left, top };
  }

  function runAction(action: string, node: RequestNode) {
    openActionsID = '';
    if (action === 'Rename') onRename(node);
    if (action === 'Add request') onAddRequest(node);
    if (action === 'Add folder') onAddFolder(node);
    if (action === 'Run collection') onRun(node);
    if (action === 'Generate code') onGenerateCode(node);
    if (action === 'Duplicate') onDuplicate(node);
    if (action === 'Move to…') onMove(node);
    if (action === 'Move up') onReorder(node.id, 'up');
    if (action === 'Move down') onReorder(node.id, 'down');
    if (action === 'Delete') onDelete(node.id);
  }
</script>

<nav class="tree" aria-label={translate($locale, 'Collections')}>
  {#each visit(collections, 0, collapsedIDs) as row (row.node.id)}
    <div class:active={selectedID === row.node.id} class:menu-open={openActionsID === row.node.id} class:drop-before={dropTarget === row.node.id && dropPosition === 'before'} class:drop-after={dropTarget === row.node.id && dropPosition === 'after'} class:drop-inside={dropTarget === row.node.id && dropPosition === 'inside'} class:dragging={draggedNode?.id === row.node.id} class="tree-row" data-id={row.node.id} style={`--depth:${row.depth}`}>
      <button class="tree-item" aria-expanded={row.node.kind === 'request' ? undefined : !collapsedIDs.has(row.node.id)} draggable={row.node.kind !== 'collection'} ondragstart={(event) => startDrag(event, row.node)} ondragend={() => { draggedNode = null; dropTarget = ''; }} ondragover={(event) => dragOver(event, row.node)} ondragleave={() => { if (dropTarget === row.node.id) dropTarget = ''; }} ondrop={(event) => drop(event, row.node)} onclick={() => { if (row.node.kind === 'request') onSelect(row.node); else { if (row.node.kind === 'collection') onSelectCollection(row.node); toggleExpanded(row.node.id); } }} ondblclick={(event) => { event.preventDefault(); event.stopPropagation(); onRename(row.node); }}>
        {#if row.node.kind !== 'collection'}<span class="tree-drag-handle" aria-hidden="true"></span>{/if}
        <span class="method method-{(row.node.method ?? '').toLowerCase()}">{row.node.kind === 'request' ? row.node.method : collapsedIDs.has(row.node.id) ? '▸' : '▾'}</span>
        <span class="tree-name">{row.node.name}</span>
      </button>
      <button class="tree-menu" aria-label={translate($locale, 'Actions for {name}', { name: row.node.name })} aria-haspopup="menu" aria-expanded={openActionsID === row.node.id} onclick={(event) => toggleActions(event, row.node.id)}>⋯</button>
      {#if openActionsID === row.node.id}
        <div class="tree-actions-panel" role="menu" aria-label={translate($locale, '{name} actions', { name: row.node.name })} style={`--menu-left:${menuPosition.left}px;--menu-top:${menuPosition.top}px`}>
          <div class="tree-actions-title">{translate($locale, row.node.kind === 'request' ? 'Request' : row.node.kind === 'folder' ? 'Folder' : 'Collection')}</div><button role="menuitem" onclick={() => runAction('Rename', row.node)}>{translate($locale, 'Rename')}</button>
          {#if row.node.kind !== 'request'}
            <button role="menuitem" onclick={() => runAction('Add request', row.node)}>{translate($locale, 'Add request')}</button>
            <button role="menuitem" onclick={() => runAction('Add folder', row.node)}>{translate($locale, 'Add folder')}</button>
          {/if}
          {#if row.node.kind === 'collection'}<button role="menuitem" onclick={() => runAction('Run collection', row.node)}>{translate($locale, 'Run collection')}</button>{/if}
          {#if row.node.kind === 'request'}<button role="menuitem" onclick={() => runAction('Generate code', row.node)}>{translate($locale, 'Generate code')}</button>{/if}
          <button role="menuitem" onclick={() => runAction('Duplicate', row.node)}>{translate($locale, 'Duplicate')}</button>
          <button role="menuitem" onclick={() => runAction('Move to…', row.node)}>{translate($locale, 'Move to…')}</button>
          <button role="menuitem" onclick={() => runAction('Move up', row.node)}>{translate($locale, 'Move up')}</button>
          <button role="menuitem" onclick={() => runAction('Move down', row.node)}>{translate($locale, 'Move down')}</button>
          <button class="danger" role="menuitem" onclick={() => runAction('Delete', row.node)}>{translate($locale, 'Delete')}</button>
        </div>
      {/if}
    </div>
  {/each}
</nav>
