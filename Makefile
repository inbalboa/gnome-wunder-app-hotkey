TAG=`jq '.version' metadata.json`

check:
	@printf "==> checking the working tree... "
	@sh -c 'if [ -z "`git status --porcelain=v1`" ]; then printf "clean\n"; else printf "working tree is dirty, please, commit changes\n" && false; fi'

tag:
	@printf "==> tagging...\n"
	@git tag -a "v$(TAG)" -m "Release $(TAG)"

pub:
	@printf "==> pushing...\n"
	@git push --atomic origin main "v$(TAG)"

install:
	@printf "==> installing locally...\n"
	@glib-compile-schemas schemas
	@gnome-extensions pack --force --extra-source="LICENSE.md"
	@gnome-extensions install --force wunder-app-hotkey@inbalboa.github.io.shell-extension.zip
	@printf "Restart Gnome Shell session\n"

package:
	@printf "==> packaging...\n"
	@gnome-extensions pack --force --extra-source="LICENSE.md"

release: check tag pub
	@printf "\nPublished at %s\n\n" "`date`"

.DEFAULT_GOAL := package
.PHONY: check tag pub install package release
