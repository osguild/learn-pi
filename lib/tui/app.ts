/**
 * learn-tui main component — k9s-style read-only control panel for learn-pi state.
 */

import { getSelectListTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { type Component, type SelectItem, SelectList } from "@earendil-works/pi-tui";
import { matchesKey } from "@earendil-works/pi-tui";
import { truncatePlain } from "../format";
import { STALL_THRESHOLD } from "../track";
import type { Track } from "../track";
import {
	findTrack,
	loadLearnTuiSnapshot,
	type LearnTuiSnapshot,
} from "./data";
import {
	renderEmptyState,
	renderFooter,
	renderHelpBody,
	renderHomeBody,
	renderLogBody,
	renderMaterialBody,
	renderResourcesBody,
	renderScreenTitle,
	renderStatusBar,
	renderYaksBody,
} from "./render";

export type LearnTuiScreen = "home" | "tracks" | "material" | "log" | "yaks" | "resources" | "help";

interface TuiHandle {
	requestRender: () => void;
}

export class LearnTuiApp implements Component {
	private screen: LearnTuiScreen = "home";
	private viewTrackId: string;
	private selectList: SelectList | null = null;
	private refreshing = false;

	constructor(
		private readonly tui: TuiHandle,
		private readonly theme: Theme,
		private readonly done: (value: undefined) => void,
		snapshot: LearnTuiSnapshot,
	) {
		this.snapshot = snapshot;
		this.viewTrackId =
			snapshot.index.active_track_id ?? snapshot.tracks[0]?.id ?? "";
	}

	private snapshot: LearnTuiSnapshot;

	invalidate(): void {
		this.selectList?.invalidate();
	}

	handleInput(data: string): void {
		if (matchesKey(data, "q") || matchesKey(data, "ctrl+c")) {
			this.done(undefined);
			return;
		}

		if (matchesKey(data, "shift+r")) {
			void this.refresh();
			return;
		}

		if (this.screen === "tracks" && this.selectList) {
			this.selectList.handleInput(data);
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, "escape")) {
			if (this.screen !== "home") {
				this.screen = "home";
				this.selectList = null;
				this.tui.requestRender();
			} else {
				this.done(undefined);
			}
			return;
		}

		if (this.screen !== "home") return;

		if (matchesKey(data, "t")) this.openTracks();
		else if (matchesKey(data, "m")) this.setScreen("material");
		else if (matchesKey(data, "l")) this.setScreen("log");
		else if (matchesKey(data, "y")) this.setScreen("yaks");
		else if (matchesKey(data, "r")) this.setScreen("resources");
		else if (data === "?" || matchesKey(data, "shift+/")) this.setScreen("help");
	}

	render(width: number): string[] {
		const track = findTrack(this.snapshot, this.viewTrackId);
		const lines: string[] = [];

		lines.push(renderStatusBar(this.theme, this.snapshot, track, width));

		if (this.snapshot.tracks.length === 0) {
			lines.push(...renderEmptyState(this.theme, width));
			lines.push(...renderFooter(this.theme, "home", width));
			return lines;
		}

		switch (this.screen) {
			case "home":
				if (track) lines.push(...renderHomeBody(this.theme, track, width));
				break;
			case "tracks":
				lines.push(renderScreenTitle(this.theme, "Tracks", width));
				if (this.selectList) lines.push(...this.selectList.render(width));
				break;
			case "material":
				lines.push(renderScreenTitle(this.theme, "Material", width));
				if (track) lines.push(...renderMaterialBody(this.theme, track, width));
				break;
			case "log":
				lines.push(renderScreenTitle(this.theme, "Session log", width));
				if (track) lines.push(...renderLogBody(this.theme, track, width));
				break;
			case "yaks":
				lines.push(renderScreenTitle(this.theme, "Deferred yaks", width));
				if (track) lines.push(...renderYaksBody(this.theme, track, width));
				break;
			case "resources":
				lines.push(renderScreenTitle(this.theme, "Resources", width));
				if (track) lines.push(...renderResourcesBody(this.theme, track, width));
				break;
			case "help":
				lines.push(renderScreenTitle(this.theme, "Help", width));
				lines.push(...renderHelpBody(this.theme, width));
				break;
		}

		if (this.refreshing) {
			lines.push(this.theme.fg("dim", "  refreshing…"));
		}

		lines.push(...renderFooter(this.theme, this.screen, width));
		return lines;
	}

	private setScreen(screen: LearnTuiScreen): void {
		this.screen = screen;
		this.selectList = null;
		this.tui.requestRender();
	}

	private openTracks(): void {
		const items: SelectItem[] = this.snapshot.tracks.map((t) => trackSelectItem(t, this.snapshot));
		const maxVisible = Math.min(12, Math.max(4, items.length));
		this.selectList = new SelectList(items, maxVisible, getSelectListTheme());
		this.selectList.onSelect = (item) => {
			this.viewTrackId = item.value;
			this.screen = "home";
			this.selectList = null;
			this.tui.requestRender();
		};
		this.selectList.onCancel = () => {
			this.screen = "home";
			this.selectList = null;
			this.tui.requestRender();
		};
		this.screen = "tracks";
		this.tui.requestRender();
	}

	private async refresh(): Promise<void> {
		if (this.refreshing) return;
		this.refreshing = true;
		this.tui.requestRender();
		try {
			const next = await loadLearnTuiSnapshot();
			this.snapshot = next;
			if (!findTrack(this.snapshot, this.viewTrackId)) {
				this.viewTrackId =
					next.index.active_track_id ?? next.tracks[0]?.id ?? "";
			}
			if (this.screen === "tracks") {
				this.openTracks();
			}
		} finally {
			this.refreshing = false;
			this.tui.requestRender();
		}
	}
}

function trackSelectItem(track: Track, snapshot: LearnTuiSnapshot): SelectItem {
	const active = track.id === snapshot.index.active_track_id;
	const stalled = track.stall_counter >= STALL_THRESHOLD;
	const prefix = active ? "▶ " : "  ";
	const stall = stalled ? " ⚠" : "";
	return {
		value: track.id,
		label: `${prefix}${track.label}${stall}`,
		description: truncatePlain(track.next_action, 55),
	};
}
