UUID := push-to-talk-stt@local
SOURCES := metadata.json extension.js prefs.js helper/stt_helper.py schemas/org.gnome.shell.extensions.push-to-talk-stt.gschema.xml

.PHONY: all install pack lint clean

all: schemas/gschemas.compiled

schemas/gschemas.compiled: schemas/org.gnome.shell.extensions.push-to-talk-stt.gschema.xml
	glib-compile-schemas schemas

install:
	./install.sh de

pack: schemas/gschemas.compiled
	gnome-extensions pack --force --out-dir=. --extra-source=helper --extra-source=schemas .

lint:
	python3 -c "import ast, pathlib; ast.parse(pathlib.Path('helper/stt_helper.py').read_text())"
	glib-compile-schemas --strict schemas

clean:
	rm -f schemas/gschemas.compiled $(UUID).shell-extension.zip
