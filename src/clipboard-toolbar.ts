import { saveToObsidian } from './utils/obsidian-note-creator';
import { loadSettings, generalSettings, getLocalStorage, setLocalStorage } from './utils/storage-utils';
import { initializeIcons } from './icons/icons';
import dayjs from 'dayjs';

export class ClipboardToolbar {
	private container: HTMLElement;
	private autoWatchActive: boolean = false;
	private lastClipboardContent: string = '';
	private intervalId: number | null = null;
	private confirmDialog: HTMLElement | null = null;
	private confirmTimeout: number | null = null;
	private isDragging: boolean = false;
	private contentContainer: HTMLElement | null = null;
	private dragHandle: HTMLElement | null = null;
	private hoverTimeout: number | null = null;
	private collapseTimeout: number | null = null;
	private isExpanded: boolean = false;

	constructor() {
		this.container = document.createElement('div');
		this.setupUI();
		this.restorePosition();
	}

	private async restorePosition() {
		try {
			const savedTop = await getLocalStorage('clipboardToolbarTop');
			if (savedTop !== undefined && savedTop !== null) {
				const maxTop = window.innerHeight - this.container.getBoundingClientRect().height;
				const constrainedTop = Math.max(0, Math.min(savedTop, maxTop));
				this.container.style.bottom = 'unset';
				this.container.style.top = `${constrainedTop}px`;
			}
		} catch (e) {
			console.error('Failed to restore clipboard toolbar position:', e);
		}
	}

	private setupUI() {
		this.container.style.position = 'fixed';
		this.container.style.bottom = '100px';
		this.container.style.right = '0px'; // Default snapped
		this.container.style.zIndex = '2147483647'; // Max z-index
		this.container.style.display = 'flex';
		this.container.style.alignItems = 'center';
		this.container.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
		// @ts-ignore
		this.container.style.backdropFilter = 'blur(8px)';
		this.container.style.borderRadius = '8px 0 0 8px'; // Default snapped style
		this.container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
		this.container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
		this.container.style.transition = 'right 0.3s ease-out, width 0.3s ease-out, opacity 0.3s ease-out'; // Smooth snap
		this.container.style.overflow = 'hidden';
		
		// Event listeners for hover expansion
		this.container.addEventListener('mouseenter', () => this.handleMouseEnter());
		this.container.addEventListener('mouseleave', () => this.handleMouseLeave());

		// Drag Handle (Always visible)
		const dragHandle = document.createElement('div');
		dragHandle.innerHTML = '<i data-lucide="grip-vertical" width="16" height="16"></i>';
		dragHandle.style.cursor = 'grab';
		dragHandle.style.color = '#7c3aed'; // Updated color
		dragHandle.style.display = 'flex';
		dragHandle.style.alignItems = 'center';
		dragHandle.style.justifyContent = 'center';
		dragHandle.style.padding = '10px 4px';
		dragHandle.style.minWidth = '24px';
		dragHandle.onmousedown = (e) => this.handleDragStart(e);
		this.container.appendChild(dragHandle);
		this.dragHandle = dragHandle;

		// Content Container (Hidden by default)
		const contentContainer = document.createElement('div');
		contentContainer.style.display = 'flex';
		contentContainer.style.gap = '10px';
		contentContainer.style.padding = '6px 3px 6px 0';
		contentContainer.style.opacity = '0';
		contentContainer.style.maxWidth = '0';
		contentContainer.style.overflow = 'hidden';
		contentContainer.style.transition = 'opacity 0.3s ease-out, max-width 0.3s ease-out';
		this.container.appendChild(contentContainer);
		this.contentContainer = contentContainer;

		// Auto Watch Button
		const autoBtn = document.createElement('button');
		autoBtn.innerHTML = '<i data-lucide="eye-off" width="16" height="16"></i>';
		autoBtn.title = 'Auto Watch: OFF';
		autoBtn.style.padding = '8px 8px';
		autoBtn.style.cursor = 'pointer';
		autoBtn.style.backgroundColor = '#f0f0f0';
		autoBtn.style.border = '1px solid #ccc';
		autoBtn.style.borderRadius = '10px';
		autoBtn.style.color = 'black';
		autoBtn.style.display = 'flex';
		autoBtn.style.alignItems = 'center';
		autoBtn.style.justifyContent = 'center';
		autoBtn.style.flexShrink = '0'; // Prevent squishing
		autoBtn.onclick = () => this.toggleAutoWatch(autoBtn);
		contentContainer.appendChild(autoBtn);

		// Manual Capture Button
		const manualBtn = document.createElement('button');
		manualBtn.innerHTML = '<i data-lucide="clipboard-list" width="16" height="16"></i>';
		manualBtn.title = 'Save Clipboard';
		manualBtn.style.padding = '8px 8px';
		manualBtn.style.cursor = 'pointer';
		manualBtn.style.backgroundColor = '#7c3aed'; // Obsidian purple-ish
		manualBtn.style.color = 'white';
		manualBtn.style.border = 'none';
		manualBtn.style.borderRadius = '10px';
		manualBtn.style.display = 'flex';
		manualBtn.style.alignItems = 'center';
		manualBtn.style.justifyContent = 'center';
		manualBtn.style.flexShrink = '0'; // Prevent squishing
		manualBtn.onclick = () => this.manualCapture();
		contentContainer.appendChild(manualBtn);
	}

	private handleMouseEnter() {
		if (this.collapseTimeout) {
			clearTimeout(this.collapseTimeout);
			this.collapseTimeout = null;
		}

		if (!this.isExpanded && !this.hoverTimeout && !this.isDragging) {
			this.hoverTimeout = window.setTimeout(() => {
				this.expandToolbar();
			}, 1000); // 1s wait
		}
	}

	private handleMouseLeave() {
		if (this.hoverTimeout) {
			clearTimeout(this.hoverTimeout);
			this.hoverTimeout = null;
		}

		if (this.isExpanded && !this.collapseTimeout && !this.isDragging) {
			this.collapseTimeout = window.setTimeout(() => {
				this.collapseToolbar();
			}, 3000); // 3s wait
		}
	}

	private expandToolbar() {
		if (!this.contentContainer) return;
		this.isExpanded = true;
		this.hoverTimeout = null;
		this.contentContainer.style.maxWidth = '200px'; // Enough space for buttons
		this.contentContainer.style.opacity = '1';
	}

	private collapseToolbar() {
		if (!this.contentContainer) return;
		this.isExpanded = false;
		this.collapseTimeout = null;
		this.contentContainer.style.opacity = '0';
		this.contentContainer.style.maxWidth = '0';
	}

	private handleDragStart(e: MouseEvent) {
		if (e.button !== 0) return; // Only left click
		e.preventDefault(); // Prevent text selection
		this.isDragging = true;
		this.container.style.transition = 'none'; // Disable transition during drag
		this.container.style.borderRadius = '8px'; // Restore full radius
		
		const startX = e.clientX;
		const startY = e.clientY;
		const rect = this.container.getBoundingClientRect();
		// Capture initial offset from mouse to top-left of container
		const offsetX = startX - rect.left;
		const offsetY = startY - rect.top;

		// Convert to absolute positioning (left/top) for dragging
		this.container.style.right = 'unset';
		this.container.style.bottom = 'unset';
		this.container.style.left = `${rect.left}px`;
		this.container.style.top = `${rect.top}px`;
		
		const dragHandle = e.currentTarget as HTMLElement;
		dragHandle.style.cursor = 'grabbing';

		const onMouseMove = (moveEvent: MouseEvent) => {
			if (!this.isDragging) return;
			
			const newLeft = moveEvent.clientX - offsetX;
			const newTop = moveEvent.clientY - offsetY;
			
			this.container.style.left = `${newLeft}px`;
			this.container.style.top = `${newTop}px`;
		};

		const onMouseUp = () => {
			this.isDragging = false;
			dragHandle.style.cursor = 'grab';
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
			this.snapToRight();
		};

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
	}

	private snapToRight() {
		const rect = this.container.getBoundingClientRect();
		
		// Constrain top to be within viewport
		const maxTop = window.innerHeight - rect.height;
		const constrainedTop = Math.max(0, Math.min(rect.top, maxTop));
		
		// Save new position
		setLocalStorage('clipboardToolbarTop', constrainedTop).catch(console.error);

		// Apply snapping
		this.container.style.left = 'unset';
		
		requestAnimationFrame(() => {
			this.container.style.transition = 'all 0.3s ease-out';
			this.container.style.right = '0px';
			this.container.style.top = `${constrainedTop}px`;
			this.container.style.borderRadius = '8px 0 0 8px';
		});
	}

	private async toggleAutoWatch(btn: HTMLButtonElement) {
		this.autoWatchActive = !this.autoWatchActive;
		if (this.autoWatchActive) {
			btn.innerHTML = '<i data-lucide="eye" width="16" height="16"></i>';
			btn.title = 'Auto Watch: ON';
			btn.style.backgroundColor = '#22c55e'; // Green
			btn.style.color = 'white';
			
			// Initialize last content to current to avoid immediate trigger
			try {
				this.lastClipboardContent = await navigator.clipboard.readText();
			} catch (e) {
				console.error('Failed to read clipboard initially:', e);
			}

			this.intervalId = window.setInterval(() => this.checkClipboard(), 1000);
		} else {
			btn.innerHTML = '<i data-lucide="eye-off" width="16" height="16"></i>';
			btn.title = 'Auto Watch: OFF';
			btn.style.backgroundColor = '#f0f0f0';
			btn.style.color = 'black';
			if (this.intervalId) {
				clearInterval(this.intervalId);
				this.intervalId = null;
			}
		}
		initializeIcons(btn);
	}

	private async checkClipboard() {
		try {
			const text = await navigator.clipboard.readText();
			if (text && text !== this.lastClipboardContent) {
				this.lastClipboardContent = text;
				this.showConfirmDialog(text);
			}
		} catch (e) {
			// Quietly fail as clipboard read might be blocked when not focused
		}
	}

	private showConfirmDialog(content: string) {
		if (this.confirmDialog) {
			this.confirmDialog.remove();
			if (this.confirmTimeout) clearTimeout(this.confirmTimeout);
		}

		const dialog = document.createElement('div');
		dialog.style.position = 'fixed';
		dialog.style.top = '20px';
		dialog.style.right = '20px';
		dialog.style.backgroundColor = '#333';
		dialog.style.color = 'white';
		dialog.style.padding = '15px';
		dialog.style.borderRadius = '8px';
		dialog.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
		dialog.style.zIndex = '2147483647';
		dialog.style.maxWidth = '300px';

		const msg = document.createElement('p');
		msg.textContent = 'Clipboard changed. Save to Obsidian?';
		msg.style.margin = '0 0 10px 0';
		dialog.appendChild(msg);

		const btnRow = document.createElement('div');
		btnRow.style.display = 'flex';
		btnRow.style.gap = '10px';

		const yesBtn = document.createElement('button');
		yesBtn.textContent = 'Yes';
		yesBtn.style.padding = '5px 15px';
		yesBtn.style.cursor = 'pointer';
		yesBtn.onclick = () => {
			this.performSave(content);
			remove();
		};

		const noBtn = document.createElement('button');
		noBtn.textContent = 'No';
		noBtn.style.padding = '5px 15px';
		noBtn.style.cursor = 'pointer';
		noBtn.onclick = () => remove();

		btnRow.appendChild(yesBtn);
		btnRow.appendChild(noBtn);
		dialog.appendChild(btnRow);

		document.body.appendChild(dialog);
		this.confirmDialog = dialog;

		const remove = () => {
			if (dialog.parentNode) dialog.remove();
			this.confirmDialog = null;
			if (this.confirmTimeout) clearTimeout(this.confirmTimeout);
		};

		this.confirmTimeout = window.setTimeout(remove, 5000);
	}

	private async manualCapture() {
		try {
			const text = await navigator.clipboard.readText();
			if (text) {
				await this.performSave(text);
			} else {
				alert('Clipboard is empty');
			}
		} catch (e) {
			console.error('Failed to read clipboard', e);
			alert('Failed to read clipboard: ' + e);
		}
	}

	private async performSave(content: string) {
		try {
			await loadSettings();
			const vault = generalSettings.vaults.length > 0 ? generalSettings.vaults[0] : '';
			const timestamp = dayjs().format('YYYY-MM-DD HH-mm-ss');
			const noteName = `Clipboard ${timestamp}`;
			
			// Using basic save behavior
			await saveToObsidian(
				content,
				noteName,
				'/', // root path
				vault,
				'create'
			);
			console.log('Clipboard saved to Obsidian');
		} catch (e) {
			console.error('Failed to save to Obsidian', e);
			alert('Failed to save to Obsidian');
		}
	}

	public mount() {
		document.body.appendChild(this.container);
		initializeIcons(this.container);
	}
}

export function mountClipboardToolbar() {
	const toolbar = new ClipboardToolbar();
	toolbar.mount();
}
