import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const MAX_NUMBER = 20;
const ICON_SIZE = 32;

export default class WunderAppHotkeyPreferences extends ExtensionPreferences {
    fillPreferencesWindow(win) {
        const settings = this.getSettings('org.gnome.shell.extensions.wunder-app-hotkey');

        this.hotkeyRows = [];
        this.hotkeyButtons = new Map();
        this.addAppHotkeyPage(win, settings);
        this.addMiscSettingPage(win, settings);
        this.refreshConflicts(settings);
    }

    addAppHotkeyPage(win, settings) {
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        win.add(page);

        this.hotkeysGroup = new Adw.PreferencesGroup();
        page.add(this.hotkeysGroup);

        const addBtn = new Gtk.Button({
            label: 'Add Application',
            halign: Gtk.Align.CENTER,
            css_classes: ['suggested-action', 'pill'],
        });
        addBtn.connect('clicked', () => this.onAddApplication(settings, win));
        const addBtnGroup = new Adw.PreferencesGroup();
        addBtnGroup.add(addBtn);
        page.add(addBtnGroup);

        const n = settings.get_int('number');
        for (let i = 0; i < n; i++)
            this.makeAppHotkeyRow(i, settings, win);
    }

    addMiscSettingPage(win, settings) {
        const page = new Adw.PreferencesPage({
            title: 'Misc',
            icon_name: 'dialog-information-symbolic',
        });
        win.add(page);

        const optionsGroup = new Adw.PreferencesGroup();
        page.add(optionsGroup);

        const restrictRow = new Adw.SwitchRow({
            title: 'Restrict to current workspace',
        });
        optionsGroup.add(restrictRow);
        settings.bind('restrict-to-current-workspace', restrictRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const hideActiveRow = new Adw.SwitchRow({
            title: 'Drop the window to the background if it is already in focus',
        });
        optionsGroup.add(hideActiveRow);
        settings.bind('hide-active', hideActiveRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const launchRow = new Adw.SwitchRow({
            title: 'Do not launch if not running',
            subtitle: 'Skip starting the application if it is not running yet',
        });
        optionsGroup.add(launchRow);
        settings.bind('do-not-launch-if-not-running', launchRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const cycleGroup = new Adw.PreferencesGroup();
        page.add(cycleGroup);
        const cycleRow = new Adw.ActionRow({
            title: 'Unbound cycle',
            subtitle: 'Cycle through apps that aren\'t bound to a hotkey in the other tab',
        });
        const cycleBtn = this.makeHotkeyButton('hotkey-unbound-cycle', settings, win);
        cycleBtn.set_valign(Gtk.Align.CENTER);
        cycleRow.add_suffix(cycleBtn);
        cycleGroup.add(cycleRow);
    }

    makeAppHotkeyRow(i, settings, parentWin) {
        const row = new Adw.ActionRow();
        row._handlerIds = [];

        const iconImg = new Gtk.Image({pixel_size: ICON_SIZE});
        row.add_prefix(iconImg);

        const updateRow = () => {
            const id = settings.get_string(`app-${i}`);
            const info = id ? Gio.DesktopAppInfo.new(id) : null;
            row.title = info?.get_name() ?? '(unknown)';
            row.subtitle = info?.get_description() ?? '';
            const icon = info?.get_icon();
            if (icon)
                iconImg.set_from_gicon(icon);
            else
                iconImg.clear();
        };
        row._handlerIds.push(settings.connect(`changed::app-${i}`, updateRow));
        updateRow();

        const hotkeyBtn = this.makeHotkeyButton(`hotkey-${i}`, settings, parentWin);
        hotkeyBtn.set_valign(Gtk.Align.CENTER);
        row.add_suffix(hotkeyBtn);
        row._handlerIds.push(hotkeyBtn._settingsHandlerId);

        const delBtn = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat', 'destructive-action'],
            tooltip_text: 'Remove',
        });
        delBtn.connect('clicked', () => this.deleteHotkey(i, settings));
        row.add_suffix(delBtn);

        this.hotkeysGroup.add(row);
        this.hotkeyRows.push(row);
    }

    onAddApplication(settings, parentWin) {
        const n = settings.get_int('number');
        if (n >= MAX_NUMBER)
            return;

        this.createAppChooserDialog(parentWin, id => {
            settings.set_string(`app-${n}`, id);
            settings.set_int('number', n + 1);
            this.makeAppHotkeyRow(n, settings, parentWin);
        });
    }

    deleteHotkey(index, settings) {
        const lastRow = this.hotkeyRows.pop();
        for (const id of lastRow._handlerIds)
            settings.disconnect(id);

        const n = settings.get_int('number') - 1;
        this.hotkeyButtons.delete(`hotkey-${n}`);

        for (let i = index; i < n; i++) {
            settings.set_strv(`hotkey-${i}`, settings.get_strv(`hotkey-${i + 1}`));
            settings.set_string(`app-${i}`, settings.get_string(`app-${i + 1}`));
        }
        settings.reset(`hotkey-${n}`);
        settings.reset(`app-${n}`);

        this.hotkeysGroup.remove(lastRow);

        settings.set_int('number', n);
        this.refreshConflicts(settings);
    }

    makeHotkeyButton(key, settings, parentWin) {
        const btn = new Gtk.Button({css_classes: ['pill']});
        btn.connect('clicked', () => {
            this.createShortcutDialog(key, settings, parentWin);
        });

        btn._settingsHandlerId = settings.connect(`changed::${key}`, () => {
            this.updateHotkeyButton(btn, key, settings);
            this.refreshConflicts(settings);
        });
        this.updateHotkeyButton(btn, key, settings);

        this.hotkeyButtons.set(key, btn);
        return btn;
    }

    refreshConflicts(settings) {
        const counts = new Map();
        for (const key of this.hotkeyButtons.keys()) {
            const accel = settings.get_strv(key)[0];
            if (accel)
                counts.set(accel, (counts.get(accel) ?? 0) + 1);
        }
        for (const [key, btn] of this.hotkeyButtons) {
            const accel = settings.get_strv(key)[0];
            const isDup = accel && counts.get(accel) > 1;
            if (isDup) {
                btn.add_css_class('destructive-action');
                btn.set_tooltip_text('Duplicate hotkey — this shortcut is assigned to another slot');
            } else {
                btn.remove_css_class('destructive-action');
                btn.set_tooltip_text('');
            }
        }
    }

    updateHotkeyButton(btn, key, settings) {
        const text = settings.get_strv(key)[0];
        btn.set_label(text || 'Click to assign hotkey');
    }

    createShortcutDialog(hotkeyKey, settings, parentWin) {
        const dialog = new Adw.Window({
            title: 'Set hotkey',
            modal: true,
            transient_for: parentWin,
            default_width: 440,
            default_height: 200,
            resizable: false,
        });

        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(new Adw.HeaderBar());
        dialog.set_content(toolbarView);

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            margin_start: 16,
            margin_end: 16,
            margin_top: 16,
            margin_bottom: 16,
        });
        toolbarView.set_content(box);

        const label = new Gtk.Label({
            vexpand: true,
            label: 'Press keyboard shortcut, or Escape to cancel, or BackSpace to clear the hotkey.',
        });
        box.append(label);

        const eventController = new Gtk.EventControllerKey();
        dialog.add_controller(eventController);

        eventController.connect('key-pressed', (_widget, keyval, keycode, state) => {
            let mask = state & Gtk.accelerator_get_default_mod_mask();
            mask &= ~Gdk.ModifierType.LOCK_MASK;

            if (mask === 0 && keyval === Gdk.KEY_Escape) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }

            if (keyval === Gdk.KEY_BackSpace) {
                settings.set_strv(hotkeyKey, []);
                dialog.close();
                return Gdk.EVENT_STOP;
            }

            if (this.isBindingValid({mask, keycode, keyval})) {
                const binding = Gtk.accelerator_name_with_keycode(
                    null,
                    keyval,
                    keycode,
                    mask
                );
                settings.set_strv(hotkeyKey, [binding]);
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            return Gdk.EVENT_PROPAGATE;
        });

        dialog.present();
    }

    isBindingValid({mask, keycode, keyval}) {
        if ((mask === 0 || mask === Gdk.ModifierType.SHIFT_MASK) && keycode !== 0 && (
            (keyval >= Gdk.KEY_a && keyval <= Gdk.KEY_z) ||
                (keyval >= Gdk.KEY_A && keyval <= Gdk.KEY_Z) ||
                (keyval >= Gdk.KEY_0 && keyval <= Gdk.KEY_9) ||
                (keyval >= Gdk.KEY_kana_fullstop && keyval <= Gdk.KEY_semivoicedsound) ||
                (keyval >= Gdk.KEY_Arabic_comma && keyval <= Gdk.KEY_Arabic_sukun) ||
                (keyval >= Gdk.KEY_Serbian_dje && keyval <= Gdk.KEY_Cyrillic_HARDSIGN) ||
                (keyval >= Gdk.KEY_Greek_ALPHAaccent && keyval <= Gdk.KEY_Greek_omega) ||
                (keyval >= Gdk.KEY_hebrew_doublelowline && keyval <= Gdk.KEY_hebrew_taf) ||
                (keyval >= Gdk.KEY_Thai_kokai && keyval <= Gdk.KEY_Thai_lekkao) ||
                (keyval >= Gdk.KEY_Hangul_Kiyeog && keyval <= Gdk.KEY_Hangul_J_YeorinHieuh) ||
                (keyval === Gdk.KEY_space && mask === 0)))
            return false;

        return Gtk.accelerator_valid(keyval, mask) ||
            (keyval === Gdk.KEY_Tab && mask !== 0) ||
            (keyval === Gdk.KEY_Scroll_Lock) ||
            (keyval === Gdk.KEY_Break);
    }

    createAppChooserDialog(parentWin, onConfirm) {
        const dialog = new Adw.Window({
            title: 'Choose an application',
            modal: true,
            transient_for: parentWin,
            default_width: 500,
            default_height: 600,
        });

        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(new Adw.HeaderBar());
        dialog.set_content(toolbarView);

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_start: 12,
            margin_end: 12,
            margin_top: 12,
            margin_bottom: 12,
        });
        toolbarView.set_content(box);

        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: 'Search applications',
        });
        box.append(searchEntry);

        const scrolledWindow = new Gtk.ScrolledWindow({vexpand: true});
        box.append(scrolledWindow);

        const listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.SINGLE,
            css_classes: ['boxed-list'],
        });
        scrolledWindow.set_child(listBox);

        const apps = this.getInstalledApps()
            .sort((a, b) => a.name.localeCompare(b.name));

        apps.forEach(({name, id, description, icon}) => {
            const row = new Adw.ActionRow({
                title: name,
                subtitle: description,
                activatable: true,
            });
            if (icon)
                row.add_prefix(new Gtk.Image({gicon: icon, pixel_size: ICON_SIZE}));
            row.connect('activated', () => {
                onConfirm(id);
                dialog.close();
            });
            listBox.append(row);
        });

        const matchesFilter = row => {
            const query = searchEntry.text.toLowerCase();
            if (!query)
                return true;
            return row.title.toLowerCase().includes(query) ||
                (row.subtitle ?? '').toLowerCase().includes(query);
        };

        const firstVisibleRow = () => {
            let child = listBox.get_first_child();
            while (child) {
                if (matchesFilter(child))
                    return child;
                child = child.get_next_sibling();
            }
            return null;
        };

        listBox.set_filter_func(matchesFilter);
        searchEntry.connect('search-changed', () => listBox.invalidate_filter());

        searchEntry.connect('activate', () => {
            const row = firstVisibleRow();
            if (row)
                row.emit('activated');
        });

        const keyController = new Gtk.EventControllerKey();
        searchEntry.add_controller(keyController);
        keyController.connect('key-pressed', (_w, keyval) => {
            if (keyval === Gdk.KEY_Down) {
                const row = firstVisibleRow();
                if (row) {
                    listBox.select_row(row);
                    row.grab_focus();
                }
                return Gdk.EVENT_STOP;
            }
            return Gdk.EVENT_PROPAGATE;
        });

        dialog.present();
        searchEntry.grab_focus();
    }

    getInstalledApps() {
        return Gio.AppInfo.get_all()
            .filter(ai => ai.should_show())
            .map(ai => ({
                name: ai.get_name(),
                id: ai.get_id(),
                description: ai.get_description() ?? '',
                icon: ai.get_icon(),
            }));
    }
}
