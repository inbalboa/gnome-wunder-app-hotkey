import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MAX_NUMBER = 20;

const CYCLABLE_WINDOW_TYPES = new Set([
    Meta.WindowType.NORMAL,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
]);

export default class WunderAppHotkeyExtension extends Extension {
    apps = null;
    settings = null;
    settingId = null;
    tracker = null;
    restrictToCurrentWorkspace = false;
    doNotLaunchIfNotRunning = false;

    enable() {
        this.apps = [];
        this.settings = this.getSettings('org.gnome.shell.extensions.wunder-app-hotkey');
        this.settingId = this.settings.connect('changed', () => this.initSettings());
        this.initSettings();
        this.tracker = Shell.WindowTracker.get_default();

        for (let i = 0; i < MAX_NUMBER; i++)
            this.addKeyBinding(`hotkey-${i}`, () => this.focusOrLaunch(this.apps[i]));

        this.addKeyBinding('hotkey-unbound-cycle', () => this.unboundCycle());
    }

    disable() {
        Main.wm.removeKeybinding('hotkey-unbound-cycle');
        for (let i = 0; i < MAX_NUMBER; i++)
            Main.wm.removeKeybinding(`hotkey-${i}`);

        if (this.settingId) {
            this.settings.disconnect(this.settingId);
            this.settingId = null;
        }

        this.tracker = null;
        this.settings = null;
        this.apps = null;
    }

    initSettings() {
        const existingApps = Gio.AppInfo.get_all()
            .filter(ai => ai.should_show());

        for (let i = 0; i < MAX_NUMBER; i++)
            this.apps[i] = existingApps.find(a => this.isMatchingApp(a, this.settings.get_string(`app-${i}`)));


        this.restrictToCurrentWorkspace = this.settings.get_boolean('restrict-to-current-workspace');
        this.doNotLaunchIfNotRunning = this.settings.get_boolean('do-not-launch-if-not-running');
    }

    addKeyBinding(key, callback) {
        Main.wm.addKeybinding(
            key,
            this.settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            callback
        );
    }

    isMatchingApp(app, id) {
        return app?.get_id() === id;
    }

    focusOrLaunch(definedApp) {
        if (!definedApp)
            return;

        const appWindows = [];
        let activeAppWindow = null;
        let topmostAppWindow = null;
        let mostRecentTime = 0;

        for (const mw of this.getAllWindows()) {
            const winApp = this.tracker.get_window_app(mw);
            if (winApp && winApp.get_id() === definedApp.get_id()) {
                appWindows.push(mw);

                // The app is already active; prepare for cycling
                if (mw.has_focus())
                    activeAppWindow = mw;

                // Determine which window was used last
                const userTime = mw.get_user_time();
                if (userTime > mostRecentTime) {
                    mostRecentTime = userTime;
                    topmostAppWindow = mw;
                }
            }
        }

        if (appWindows.length > 0) {
            if (activeAppWindow) {
                // App was already active; cycle through its windows
                if (appWindows.length === 1 && this.settings.get_boolean('hide-active')) {
                    this.hide(activeAppWindow);
                } else {
                    appWindows.sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
                    const currentIndex = appWindows.indexOf(activeAppWindow);
                    const nextIndex = (currentIndex + 1) % appWindows.length;
                    this.activate(appWindows[nextIndex]);
                }
            } else {
                // App wasn't active already; activate most recently used
                this.activate(topmostAppWindow);
            }
            return;
        }

        if (!this.doNotLaunchIfNotRunning)
            definedApp.launch([], null);
    }

    unboundCycle() {
        const activeWin = this.getActiveWindow();
        if (!activeWin)
            return;

        const wins = this.getAllWindows();
        const position = wins.indexOf(activeWin);
        if (position === -1)
            return;

        for (let i = 0; i < wins.length; i++) {
            const win = wins[(i + position + 1) % wins.length];
            const winApp = this.tracker.get_window_app(win);
            if (!this.appIsBound(winApp)) {
                this.activate(win);
                break;
            }
        }
    }

    getAllWindows() {
        let wins = global.get_window_actors()
            .map(wa => wa.get_meta_window())
            .filter(w => w && !w.is_override_redirect());

        if (this.restrictToCurrentWorkspace) {
            const workspace = global.get_workspace_manager().get_active_workspace().index();
            wins = wins.filter(w => w.get_workspace().index() === workspace);
        }
        return wins;
    }

    getActiveWindow() {
        const win = global.display.focus_window;
        if (win && CYCLABLE_WINDOW_TYPES.has(win.get_window_type()))
            return win;
        return null;
    }

    appIsBound(app) {
        if (!app)
            return false;
        for (const a of this.apps) {
            if (a && app.get_id() === a.get_id())
                return true;
        }
        return false;
    }

    activate(metawin) {
        const now = global.get_current_time();
        metawin.activate(now);
        metawin.focus(now);
    }

    hide(metawin) {
        metawin.minimize();
    }
}
