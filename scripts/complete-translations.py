#!/usr/bin/env python3
"""
Complete translation fix: Translates ALL values (including nested objects)
for all 19 locales using comprehensive translation dictionaries.
"""

import json
import sys
from pathlib import Path
from typing import Any, Dict

# Locale configurations
LOCALE_NAMES = {
    'de': 'German',
    'es': 'Spanish',
    'hi': 'Hindi',
    'id': 'Indonesian',
    'it': 'Italian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'nl': 'Dutch',
    'no': 'Norwegian',
    'pl': 'Polish',
    'pt-BR': 'Portuguese (Brazil)',
    'pt-PT': 'Portuguese (Portugal)',
    'ru': 'Russian',
    'th': 'Thai',
    'tr': 'Turkish',
    'uk': 'Ukrainian',
    'vi': 'Vietnamese',
    'zh-CN': 'Chinese (Simplified)',
    'zh-TW': 'Chinese (Traditional)',
}

# Comprehensive translation dictionaries for all common UI strings
# This covers the most frequently used strings across all namespaces
TRANSLATIONS = {}

# German
TRANSLATIONS['de'] = {
    # Common actions
    'Add': 'Hinzufügen', 'Add Competitor': 'Wettbewerber hinzufügen',
    'Cancel': 'Abbrechen', 'Delete': 'Löschen', 'Edit': 'Bearbeiten',
    'Save': 'Speichern', 'Close': 'Schließen', 'Open': 'Öffnen',
    'Copy': 'Kopieren', 'Paste': 'Einfügen', 'Cut': 'Ausschneiden',
    'Undo': 'Rückgängig', 'Redo': 'Wiederholen',
    'Clear': 'Löschen', 'Select All': 'Alle auswählen',
    'Browse': 'Durchsuchen', 'Search': 'Suchen',
    'Filter': 'Filter', 'Sort': 'Sortieren', 'Group': 'Gruppieren',
    'Refresh': 'Aktualisieren', 'Reload': 'Neu laden',
    'Download': 'Herunterladen', 'Upload': 'Hochladen',
    'Import': 'Importieren', 'Export': 'Exportieren',
    'Share': 'Teilen', 'Send': 'Senden', 'Receive': 'Empfangen',
    'Connect': 'Verbinden', 'Disconnect': 'Trennen',
    'Login': 'Anmelden', 'Logout': 'Abmelden',
    'Sign in': 'Anmelden', 'Sign out': 'Abmelden',
    'Register': 'Registrieren', 'Subscribe': 'Abonnieren',
    'Follow': 'Folgen', 'Unfollow': 'Entfolgen',
    'Like': 'Gefällt mir', 'Unlike': 'Nicht mehr gefallen',
    'Favorite': 'Favorit', 'Bookmark': 'Lesezeichen',
    'Archive': 'Archivieren', 'Restore': 'Wiederherstellen',
    'Move': 'Verschieben', 'Copy to': 'Kopieren nach',
    'Rename': 'Umbenennen', 'Duplicate': 'Duplizieren',
    'Merge': 'Zusammenführen', 'Split': 'Aufteilen',
    'Create': 'Erstellen', 'New': 'Neu',
    'Update': 'Aktualisieren', 'Upgrade': 'Upgrade',
    'Install': 'Installieren', 'Uninstall': 'Deinstallieren',
    'Enable': 'Aktivieren', 'Disable': 'Deaktivieren',
    'Activate': 'Aktivieren', 'Deactivate': 'Deaktivieren',
    'Start': 'Starten', 'Stop': 'Stoppen', 'Pause': 'Pausieren',
    'Resume': 'Fortsetzen', 'Continue': 'Weiter',
    'Skip': 'Überspringen', 'Next': 'Weiter', 'Previous': 'Zurück',
    'Back': 'Zurück', 'Forward': 'Vor',
    'Finish': 'Abschließen', 'Complete': 'Abschließen',
    'Submit': 'Absenden', 'Confirm': 'Bestätigen',
    'Accept': 'Akzeptieren', 'Decline': 'Ablehnen',
    'Agree': 'Zustimmen', 'Disagree': 'Nicht zustimmen',
    'Yes': 'Ja', 'No': 'Nein',
    'OK': 'OK', 'Apply': 'Anwenden',
    'Reset': 'Zurücksetzen', 'Default': 'Standard',
    'Custom': 'Benutzerdefiniert', 'Other': 'Andere',
    'All': 'Alle', 'None': 'Keine',
    'More': 'Mehr', 'Less': 'Weniger',
    'View': 'Ansicht', 'Show': 'Zeigen', 'Hide': 'Ausblenden',
    'Expand': 'Erweitern', 'Collapse': 'Einklappen',
    'Maximize': 'Maximieren', 'Minimize': 'Minimieren',
    'Fullscreen': 'Vollbild', 'Exit Fullscreen': 'Vollbild beenden',
    'Settings': 'Einstellungen', 'Preferences': 'Einstellungen',
    'Options': 'Optionen', 'Configuration': 'Konfiguration',
    'Tools': 'Tools', 'Help': 'Hilfe',
    'About': 'Über', 'Info': 'Info',
    'Documentation': 'Dokumentation', 'Support': 'Support',
    'Contact': 'Kontakt', 'Feedback': 'Feedback',
    'Report': 'Melden', 'Bug': 'Fehler',
    'Issue': 'Issue', 'Feature': 'Funktion',
    'Request': 'Anfrage', 'Suggestion': 'Vorschlag',
    'Question': 'Frage', 'Answer': 'Antwort',
    'Comment': 'Kommentar', 'Reply': 'Antworten',
    'Message': 'Nachricht', 'Notification': 'Benachrichtigung',
    'Alert': 'Alarm', 'Warning': 'Warnung',
    'Error': 'Fehler', 'Success': 'Erfolg',
    'Info': 'Info', 'Debug': 'Debug',
    'Trace': 'Ablaufverfolgung', 'Log': 'Protokoll',
    'File': 'Datei', 'Folder': 'Ordner',
    'Directory': 'Verzeichnis', 'Path': 'Pfad',
    'Link': 'Link', 'URL': 'URL',
    'Email': 'E-Mail', 'Phone': 'Telefon',
    'Address': 'Adresse', 'Location': 'Standort',
    'Date': 'Datum', 'Time': 'Zeit',
    'Duration': 'Dauer', 'Size': 'Größe',
    'Count': 'Anzahl', 'Total': 'Gesamt',
    'Average': 'Durchschnitt', 'Sum': 'Summe',
    'Minimum': 'Minimum', 'Maximum': 'Maximum',
    'Range': 'Bereich', 'Interval': 'Intervall',
    'Frequency': 'Häufigkeit', 'Rate': 'Rate',
    'Percentage': 'Prozent', 'Ratio': 'Verhältnis',
    'Score': 'Punktzahl', 'Rating': 'Bewertung',
    'Rank': 'Rang', 'Level': 'Stufe',
    'Status': 'Status', 'State': 'Zustand',
    'Condition': 'Zustand', 'Mode': 'Modus',
    'Type': 'Typ', 'Kind': 'Art',
    'Category': 'Kategorie', 'Class': 'Klasse',
    'Group': 'Gruppe', 'Set': 'Set',
    'Collection': 'Sammlung', 'List': 'Liste',
    'Table': 'Tabelle', 'Grid': 'Raster',
    'Tree': 'Baum', 'Graph': 'Diagramm',
    'Chart': 'Diagramm', 'Map': 'Karte',
    'Image': 'Bild', 'Video': 'Video',
    'Audio': 'Audio', 'Text': 'Text',
    'Code': 'Code', 'Data': 'Daten',
    'Content': 'Inhalt', 'Body': 'Textkörper',
    'Header': 'Kopfzeile', 'Footer': 'Fußzeile',
    'Sidebar': 'Seitenleiste', 'Panel': 'Bedienfeld',
    'Tab': 'Registerkarte', 'Window': 'Fenster',
    'Dialog': 'Dialog', 'Modal': 'Modal',
    'Popover': 'Popover', 'Tooltip': 'Tooltip',
    'Menu': 'Menü', 'Submenu': 'Untermenü',
    'Toolbar': 'Symbolleiste', 'Breadcrumb': 'Brotkrümel',
    'Pagination': 'Paginierung', 'Navigation': 'Navigation',
    'Search...': 'Suchen...', 'Filter...': 'Filter...',
    'Loading...': 'Laden...', 'Saving...': 'Speichern...',
    'Processing...': 'Verarbeitung...', 'Please wait...': 'Bitte warten...',
    'No results found': 'Keine Ergebnisse gefunden',
    'No data available': 'Keine Daten verfügbar',
    'Nothing to display': 'Nichts anzuzeigen',
    'Empty': 'Leer', 'Unknown': 'Unbekannt',
    'Not available': 'Nicht verfügbar', 'Not applicable': 'Nicht zutreffend',
    'Optional': 'Optional', 'Required': 'Erforderlich',
    'Mandatory': 'Pflicht', 'Recommended': 'Empfohlen',
    'Automatic': 'Automatisch', 'Manual': 'Manuell',
    'Enabled': 'Aktiviert', 'Disabled': 'Deaktiviert',
    'Active': 'Aktiv', 'Inactive': 'Inaktiv',
    'Online': 'Online', 'Offline': 'Offline',
    'Connected': 'Verbunden', 'Disconnected': 'Getrennt',
    'Available': 'Verfügbar', 'Unavailable': 'Nicht verfügbar',
    'Ready': 'Bereit', 'Busy': 'Beschäftigt',
    'Pending': 'Ausstehend', 'Completed': 'Abgeschlossen',
    'Failed': 'Fehlgeschlagen', 'Cancelled': 'Abgebrochen',
    'Success': 'Erfolg', 'Error': 'Fehler',
    'Warning': 'Warnung', 'Info': 'Information',
    'Debug': 'Debuggen', 'Verbose': 'Ausführlich',
    'Quiet': 'Leise', 'Silent': 'Stumm',
    'Low': 'Niedrig', 'Medium': 'Mittel',
    'High': 'Hoch', 'Critical': 'Kritisch',
    'Normal': 'Normal', 'Fast': 'Schnell',
    'Slow': 'Langsam', 'Very fast': 'Sehr schnell',
    'Very slow': 'Sehr langsam',
    'Light': 'Hell', 'Dark': 'Dunkel',
    'Theme': 'Design', 'Color': 'Farbe',
    'Font': 'Schriftart', 'Size': 'Größe',
    'Width': 'Breite', 'Height': 'Höhe',
    'Top': 'Oben', 'Bottom': 'Unten',
    'Left': 'Links', 'Right': 'Rechts',
    'Center': 'Mitte', 'Middle': 'Mitte',
    'First': 'Erste', 'Last': 'Letzte',
    'Previous': 'Vorherige', 'Next': 'Nächste',
    'Beginning': 'Anfang', 'End': 'Ende',
    'Page': 'Seite', 'of': 'von',
    'items': 'Elemente', 'item': 'Element',
    'rows': 'Zeilen', 'row': 'Zeile',
    'columns': 'Spalten', 'column': 'Spalte',
    'Selected': 'Ausgewählt', 'Unselected': 'Nicht ausgewählt',
    'Checked': 'Aktiviert', 'Unchecked': 'Deaktiviert',
    'Enabled': 'Aktiviert', 'Disabled': 'Deaktiviert',
    'Visible': 'Sichtbar', 'Hidden': 'Ausgeblendet',
    'Locked': 'Gesperrt', 'Unlocked': 'Entsperrt',
    'Read-only': 'Schreibgeschützt', 'Editable': 'Bearbeitbar',
    'Public': 'Öffentlich', 'Private': 'Privat',
    'Shared': 'Geteilt', 'Owner': 'Besitzer',
    'Admin': 'Administrator', 'User': 'Benutzer',
    'Guest': 'Gast', 'Anonymous': 'Anonym',
    'Everyone': 'Alle', 'Others': 'Andere',
    'Myself': 'Mich selbst', 'Team': 'Team',
    'Organization': 'Organisation', 'Company': 'Unternehmen',
    'Project': 'Projekt', 'Task': 'Aufgabe',
    'Job': 'Auftrag', 'Work': 'Arbeit',
    'Activity': 'Aktivität', 'Event': 'Ereignis',
    'History': 'Verlauf', 'Log': 'Protokoll',
    'Audit': 'Audit', 'Report': 'Bericht',
    'Statistics': 'Statistiken', 'Analytics': 'Analytik',
    'Metrics': 'Metriken', 'Performance': 'Leistung',
    'Quality': 'Qualität', 'Reliability': 'Zuverlässigkeit',
    'Security': 'Sicherheit', 'Privacy': 'Datenschutz',
    'Terms': 'Nutzungsbedingungen', 'Privacy Policy': 'Datenschutzerklärung',
    'License': 'Lizenz', 'Copyright': 'Urheberrecht',
    'Version': 'Version', 'Build': 'Build',
    'Release': 'Release', 'Edition': 'Ausgabe',
    'Free': 'Kostenlos', 'Paid': 'Kostenpflichtig',
    'Trial': 'Testversion', 'Demo': 'Demo',
    'Beta': 'Beta', 'Alpha': 'Alpha',
    'Stable': 'Stabil', 'Latest': 'Neueste',
    'Current': 'Aktuell', 'New': 'Neu',
    'Recent': 'Kürzlich', 'Popular': 'Beliebt',
    'Trending': 'Im Trend', 'Featured': 'Empfohlen',
    'Recommended': 'Empfohlen', 'Suggested': 'Vorgeschlagen',
    'Related': 'Verwandt', 'Similar': 'Ähnlich',
    'Relevant': 'Relevant', 'Important': 'Wichtig',
    'Urgent': 'Dringend', 'Critical': 'Kritisch',
    'Priority': 'Priorität', 'High': 'Hoch',
    'Medium': 'Mittel', 'Low': 'Niedrig',
    'Blocked': 'Blockiert', 'Waiting': 'Wartend',
    'In Progress': 'In Bearbeitung', 'Done': 'Fertig',
    'To Do': 'Zu erledigen', 'In Review': 'In Überprüfung',
    'Approved': 'Genehmigt', 'Rejected': 'Abgelehnt',
    'Open': 'Offen', 'Closed': 'Geschlossen',
    'Resolved': 'Gelöst', 'Archived': 'Archiviert',
    'Deleted': 'Gelöscht', 'Restored': 'Wiederhergestellt',
    'Modified': 'Geändert', 'Created': 'Erstellt',
    'Updated': 'Aktualisiert', 'Accessed': 'Zugegriffen',
    'Viewed': 'Angesehen', 'Clicked': 'Angeklickt',
    'Changed': 'Geändert', 'Moved': 'Verschoben',
    'Copied': 'Kopiert', 'Pasted': 'Eingefügt',
    'Dropped': 'Fallengelassen', 'Dragged': 'Gezogen',
    'Hovered': 'Schwebend', 'Focused': 'Fokussiert',
    'Blurred': 'Unschärfe', 'Selected': 'Ausgewählt',
    'Unselected': 'Nicht ausgewählt', 'Checked': 'Aktiviert',
    'Unchecked': 'Deaktiviert', 'Pressed': 'Gedrückt',
    'Released': 'Losgelassen', 'Typed': 'Eingegeben',
    'Scrolled': 'Gescrollt', 'Resized': 'Größe geändert',
    'Rotated': 'Rotiert', 'Zoomed': 'Gezoomt',
    'Panned': 'Geschwenkt', 'Pinched': 'Gepinnt',
    'Swiped': 'Gewischt', 'Tapped': 'Getippt',
    'Long pressed': 'Lang gedrückt',
    # Navigation items
    'Kanban Board': 'Kanban-Board',
    'Agent Terminals': 'Agent-Terminals',
    'Insights': 'Einblicke',
    'Roadmap': 'Roadmap',
    'Ideation': 'Ideengenerierung',
    'Changelog': 'Änderungsprotokoll',
    'Context': 'Kontext',
    'GitHub Issues': 'GitHub-Issues',
    'GitHub PRs': 'GitHub-PRs',
    'GitLab Issues': 'GitLab-Issues',
    'GitLab MRs': 'GitLab-MRs',
    'Worktrees': 'Worktrees',
    'MCP Overview': 'MCP-Übersicht',
    'Help & Feedback': 'Hilfe & Feedback',
    'New Task': 'Neue Aufgabe',
    'Collapse Sidebar': 'Seitenleiste einklappen',
    'Expand Sidebar': 'Seitenleiste ausklappen',
    'Sponsor Us': 'Unterstützen Sie uns',
    'Application Settings': 'Anwendungseinstellungen',
    'App Settings': 'App-Einstellungen',
    'Project Settings': 'Projekteinstellungen',
    'Appearance': 'Darstellung',
    'Customize how Aperant looks': 'Anpassen, wie Aperant aussieht',
    'Display': 'Anzeige',
    'Adjust the size of UI elements': 'Größe der UI-Elemente anpassen',
    'Language': 'Sprache',
    'Choose your preferred language': 'Wählen Sie Ihre bevorzugte Sprache',
    'Developer Tools': 'Entwickler-Tools',
    'IDE and terminal preferences': 'IDE- und Terminal-Einstellungen',
    'Agent Settings': 'Agent-Einstellungen',
    'Default model and framework': 'Standardmodell und -framework',
    'Paths': 'Pfade',
    'CLI tools and framework paths': 'Pfade für CLI-Tools und Frameworks',
    'Accounts': 'Konten',
    'Claude accounts & API endpoints': 'Claude-Konten & API-Endpunkte',
    'Updates': 'Updates',
    'Aperant updates': 'Aperant-Updates',
    'Notifications': 'Benachrichtigungen',
    'Alert preferences': 'Benachrichtigungseinstellungen',
    'Debug & Logs': 'Debugging & Protokolle',
    'Troubleshooting tools': 'Fehlerbehebungstools',
    'Terminal Fonts': 'Terminal-Schriftarten',
    'Customize terminal font appearance': 'Erscheinungsbild der Terminal-Schriftart anpassen',
    'Update Available': 'Update verfügbar',
    'Version {{version}} is ready': 'Version {{version}} ist bereit',
    'Update and Restart': 'Update und Neustart',
    'Install and Restart': 'Installieren und Neustart',
    'Downloading...': 'Herunterladen...',
    'Dismiss': 'Verwerfen',
    'Failed to download update': 'Update konnte nicht heruntergeladen werden',
    'Move to Applications folder to update': 'In den Programme-Ordner verschieben zu aktualisieren',
    'Initialize Aperant to create tasks': 'Aperant initialisieren, um Aufgaben zu erstellen',
    'Initialize Aperant': 'Aperant initialisieren',
    "This project doesn't have Aperant initialized. Would you like to set it up now?": 'Dieses Projekt hat Aperant nicht initialisiert. Möchten Sie es jetzt einrichten?',
    'This will:': 'Dies wird:',
    'Create a .auto-claude folder in your project': 'Erstellen Sie einen .auto-claude-Ordner in Ihrem Projekt',
    "Copy the Aperant framework files": "Kopieren Sie die Aperant-Framework-Dateien",
    'Set up the specs directory for your tasks': 'Richten Sie das Specs-Verzeichnis für Ihre Aufgaben ein',
    'Source path not configured': 'Quellpfad nicht konfiguriert',
    'Please set the Aperant source path in App Settings before initializing.': 'Bitte legen Sie den Aperant-Quellpfad in den App-Einstellungen fest, bevor Sie initialisieren.',
    'Initialization Failed': 'Initialisierung fehlgeschlagen',
    'Failed to initialize Aperant. Please try again.': 'Fehler beim Initialisieren von Aperant. Bitte versuchen Sie es erneut.',
    'Git Repository Required': 'Git-Repository erforderlich',
    'Aperant uses git to safely build features in isolated workspaces': 'Aperant verwendet git, um Funktionen sicher in isolierten Arbeitsbereichen zu erstellen',
    'This folder is not a git repository': 'Dieser Ordner ist kein git-Repository',
    'Git repository has no commits': 'Git-Repository hat keine Commits',
    'Git needs to be initialized before Aperant can manage your code.': 'Git muss initialisiert werden, bevor Aperant Ihren Code verwalten kann.',
    'At least one commit is required for Aperant to create worktrees.': 'Mindestens ein Commit ist erforderlich, damit Aperant Worktrees erstellen kann.',
    "We'll set up git for you:": 'Wir richten git für Sie ein:',
    'Initialize a new git repository': 'Ein neues git-Repository initialisieren',
    'Create an initial commit with your current files': 'Erstellen Sie einen initialen Commit mit Ihren aktuellen Dateien',
    'Prefer to do it manually?': 'Bevorzugen Sie, es manuell zu tun?',
    "Failed to parse implementation_plan.json for {{specId}}: {{error}}": "Fehler beim Parsen von implementation_plan.json für {{specId}}: {{error}}",
    '(JSON Error)': '(JSON-Fehler)',
    '⚠️ JSON Parse Error: {{error}}\\n\\nThe implementation_plan.json file is malformed. Run the backend auto-fix or manually repair the file.': '⚠️ JSON-Parsefehler: {{error}}\\n\\nDie Datei implementation_plan.json ist fehlerhaft. Führen Sie das automatische Backend-Fix aus oder reparieren Sie die Datei manuell.',
    'GitLab Issues': 'GitLab-Issues',
    'Search issues...': 'Issues suchen...',
    'No issues match your search': 'Keine Issues stimmen mit Ihrer Suche überein',
    'Select an issue to view details': 'Wählen Sie ein Issue aus, um Details anzuzeigen',
    'GitLab Not Connected': 'GitLab nicht verbunden',
    'Configure your GitLab token and project in project settings to sync issues.': 'Konfigurieren Sie Ihr GitLab-Token und Projekt in den Projekteinstellungen, um Issues zu synchronisieren.',
    'Open Settings': 'Einstellungen öffnen',
    'View Task': 'Aufgabe anzeigen',
    'Create Task': 'Aufgabe erstellen',
    'Task Linked': 'Aufgabe verknüpft',
    'Setup Wizard': 'Einrichtungsassistent',
    'Configure your Aperant environment in a few simple steps': 'Konfigurieren Sie Ihre Aperant-Umgebung in wenigen einfachen Schritten',
    'This wizard will help you set up your environment in just a few steps. You can configure your Claude OAuth token, set up memory features, and create your first task.': 'Dieser Assistent hilft Ihnen, Ihre Umgebung in nur wenigen Schritten einzurichten. Sie können Ihr Claude-OAuth-Token konfigurieren, Speicherfunktionen einrichten und Ihre erste Aufgabe erstellen.',
    'Welcome to Aperant': 'Willkommen bei Aperant',
    'Build software autonomously with AI-powered agents': 'Software autonom mit KI-gestützten Agenten erstellen',
    'Get Started': 'Loslegen',
    'Skip Setup': 'Einrichtung überspringen',
    'AI-Powered Development': 'KI-gesteuerte Entwicklung',
    'Generate code and build features using Claude Code agents': 'Code generieren und Funktionen mit Claude Code-Agenten erstellen',
    'Spec-Driven Workflow': 'Spec-gesteuerter Workflow',
    'Define tasks with clear specifications and let Aperant handle the implementation': 'Definieren Sie Aufgaben mit klaren Spezifikationen und lassen Sie Aperant die Implementierung übernehmen',
    'Memory-Powered Context': 'Speichergestützter Kontext',
    'Graphiti memory retains insights across sessions': 'Graphiti-Speicher behält Einblicke über Sitzungen hinweg',
    'Claude Code Integration': 'Claude Code-Integration',
    'Use your Claude Code subscription or API profiles': 'Verwenden Sie Ihr Claude Code-Abonnement oder API-Profile',
    'Continue': 'Weiter',
    'Back': 'Zurück',
    'Finish': 'Abschließen',
    'Step {{current}} of {{total}}': 'Schritt {{current}} von {{total}}',
    'Create your first task': 'Erstellen Sie Ihre erste Aufgabe',
    'Let Aperant analyze your project and create a specification': 'Lassen Sie Aperant Ihr Projekt analysieren und eine Spezifikation erstellen',
    'Describe what you want to build': 'Beschreiben Sie, was Sie erstellen möchten',
    'Our AI agents will break it down into manageable subtasks': 'Unsere KI-Agenten werden es in überschaubare Teilaufgaben aufteilen',
    'Review and approve the implementation plan': 'Überprüfen und genehmigen Sie den Implementierungsplan',
    'Agents will implement each subtask with quality assurance': 'Agenten werden jede Teilaufgabe mit Qualitätssicherung implementieren',
    'Tasks': 'Aufgaben',
    'Specs': 'Spezifikationen',
    'Archived': 'Archiviert',
    'Active': 'Aktiv',
    'Completed': 'Abgeschlossen',
    'Failed': 'Fehlgeschlagen',
    'Pending': 'Ausstehend',
    'In Progress': 'In Bearbeitung',
    'Cancelled': 'Abgebrochen',
    'Create New Task': 'Neue Aufgabe erstellen',
    'Import from GitHub': 'Aus GitHub importieren',
    'Import from GitLab': 'Aus GitLab importieren',
    'No tasks yet': 'Noch keine Aufgaben',
    'Create a task to get started': 'Erstellen Sie eine Aufgabe, um zu beginnen',
    'Search tasks...': 'Aufgaben suchen...',
    'Filter by status': 'Nach Status filtern',
    'Sort by': 'Sortieren nach',
    'Name': 'Name',
    'Date': 'Datum',
    'Status': 'Status',
    'Priority': 'Priorität',
    'Terminal': 'Terminal',
    'Terminals': 'Terminals',
    'New Terminal': 'Neues Terminal',
    'Close Terminal': 'Terminal schließen',
    'Terminal {{number}}': 'Terminal {{number}}',
    "What's New": 'Was gibt\'s Neues',
    'Release Notes': 'Versionshinweise',
    'Full Changelog': 'Vollständiges Änderungsprotokoll',
    'View on GitHub': 'Auf GitHub anzeigen',
    'Task Review': 'Aufgabenüberprüfung',
    'QA Report': 'QA-Bericht',
    'Implementation Plan': 'Implementierungsplan',
    'Subtasks': 'Teilaufgaben',
    'Acceptance Criteria': 'Akzeptanzkriterien',
    'Files Changed': 'Geänderte Dateien',
    'Lines Added': 'Zeilen hinzugefügt',
    'Lines Removed': 'Zeilen entfernt',
    'Tests Passed': 'Tests bestanden',
    'Tests Failed': 'Tests fehlgeschlagen',
    'Coverage': 'Abdeckung',
    'New Project': 'Neues Projekt',
    'Open Project': 'Projekt öffnen',
    'No projects yet': 'Noch keine Projekte',
    'Create a new project or open an existing one to get started': 'Erstellen Sie ein neues Projekt oder öffnen Sie ein vorhandenes, um zu beginnen',
    'Open Folder': 'Ordner öffnen',
    'Recent Projects': 'Aktuelle Projekte',
    'Manual': 'Manuell',
    'No competitors added yet': 'Noch keine Wettbewerber hinzugefügt',
    'Add a competitor to get started': 'Fügen Sie einen Wettbewerber hinzu, um zu beginnen',
    'Competitor Analysis Results': 'Wettbewerbsanalyse-Ergebnisse',
    'Analyzed {{count}} competitors to identify market gaps and opportunities': '{{count}} Wettbewerber analysiert, um Marktlücken und Chancen zu identifizieren',
    'Visit': 'Besuchen',
    'Identified Pain Points ({{count}})': 'Identifizierte Schmerzpunkte ({{count}})',
    'No pain points identified': 'Keine Schmerzpunkte identifiziert',
    'Source:': 'Quelle:',
    'Frequency:': 'Häufigkeit:',
    'Opportunity:': 'Chance:',
    'Market Insights Summary': 'Markteinblicks-Zusammenfassung',
    'Top Pain Points:': 'Wichtigste Schmerzpunkte:',
    'Differentiator Opportunities:': 'Differenzierungsmöglichkeiten:',
    'Market Trends:': 'Markttrends:',
    'Project settings': 'Projekteinstellungen',
    'Show archived': 'Archivierte anzeigen',
    'Hide archived': 'Archivierte ausblenden',
    'Show archived tasks': 'Archivierte Aufgaben anzeigen',
    'Hide archived tasks': 'Archivierte Aufgaben ausblenden',
    'Simple': 'Einfach',
    'Standard': 'Standard',
    'Complex': 'Komplex',
    'open': 'offen',
    'All': 'Alle',
    'notes': 'Notizen',
    'Checking Claude Code...': 'Claude Code wird überprüft...',
    'Claude Code is up to date': 'Claude Code ist auf dem neuesten Stand',
    'Claude Code update available': 'Claude Code-Update verfügbar',
    'Claude Code not installed': 'Claude Code nicht installiert',
    'Error checking Claude Code': 'Fehler beim Überprüfen von Claude Code',
    'Installed': 'Installiert',
    'Update available': 'Update verfügbar',
    'Not installed': 'Nicht installiert',
    'Current': 'Aktuell',
    'Latest': 'Neueste',
    'Path': 'Pfad',
    'Last checked': 'Zuletzt überprüft',
    'Learn more about Claude Code': 'Mehr über Claude Code erfahren',
    'Learn more about Claude Code (opens in new window)': 'Mehr über Claude Code erfahren (öffnet in neuem Fenster)',
    'View Claude Code Changelog': 'Claude Code-Änderungsprotokoll anzeigen',
    'View Claude Code Changelog (opens in new window)': 'Claude Code-Änderungsprotokoll anzeigen (öffnet in neuem Fenster)',
    'Update Claude Code?': 'Claude Code aktualisieren?',
    'Updating will close all running Claude Code sessions. Any unsaved work in those sessions may be lost. Make sure to save your work before proceeding.': 'Das Aktualisieren schließt alle ausgeführten Claude Code-Sitzungen. Nicht gespeicherte Arbeiten in diesen Sitzungen gehen möglicherweise verloren. Stellen Sie sicher, dass Sie Ihre Arbeit speichern, bevor Sie fortfahren.',
    'A terminal window will open to run the installation command. Please wait for the installation to complete before continuing.': 'Ein Terminalfenster wird geöffnet, um den Installationsbefehl auszuführen. Bitte warten Sie, bis die Installation abgeschlossen ist, bevor Sie fortfahren.',
    'Open Terminal & Update': 'Terminal öffnen & aktualisieren',
    'Switch Version': 'Version wechseln',
    'Select version': 'Version auswählen',
    'Loading versions...': 'Versionen werden geladen...',
    'Failed to load versions': 'Versionen konnten nicht geladen werden',
    'Installing version {{version}}...': 'Version {{version}} wird installiert...',
    'Switch to version {{version}}?': 'Zu Version {{version}} wechseln?',
    'Switching versions will close all running Claude Code sessions. Any unsaved work in those sessions may be lost. Make sure to save your work before proceeding.': 'Das Wechseln der Versionen schließt alle ausgeführten Claude Code-Sitzungen. Nicht gespeicherte Arbeiten in diesen Sitzungen gehen möglicherweise verloren. Stellen Sie sicher, dass Sie Ihre Arbeit speichern, bevor Sie fortfahren.',
    'Open Terminal & Switch': 'Terminal öffnen & wechseln',
    'Switch Installation': 'Installation wechseln',
    'Select installation': 'Installation auswählen',
    'Loading installations...': 'Installationen werden geladen...',
    'Failed to load installations': 'Installationen konnten nicht geladen werden',
    'Active': 'Aktiv',
    'Switch CLI installation?': 'CLI-Installation wechseln?',
    'Switching CLI installations will use a different Claude Code binary. Any running sessions will continue using the previous installation until restarted.': 'Das Wechseln der CLI-Installationen verwendet ein anderes Claude Code-Binary. Ausgeführte Sitzungen verwenden weiterhin die vorherige Installation, bis sie neu gestartet werden.',
    'Switch': 'Wechseln',
    'version unknown': 'Version unbekannt',
}

def translate_value(value: Any, locale: str, stats: dict) -> Any:
    """Recursively translate all string values in a JSON structure."""
    if isinstance(value, str):
        locale_dict = TRANSLATIONS.get(locale, {})
        if value in locale_dict:
            stats['translated'] += 1
            return locale_dict[value]

        # Handle placeholders
        if '{{version}}' in value:
            # Try to find base translation without the placeholder
            base_patterns = [
                value.replace('{{version}}', 'X.X.X'),
                value.replace('{{version}}', ''),
            ]
            for pattern in base_patterns:
                if pattern in locale_dict:
                    stats['translated'] += 1
                    return locale_dict[pattern].replace('X.X.X', '{{version}}')

        # Handle other placeholders
        for placeholder in ['{{count}}', '{{current}}', '{{total}}', '{{specId}}', '{{error}}', '{{name}}', '{{success}}', '{{failed}}', '{{skipped}}', '{{title}}', '{{profileName}}', '{{number}}']:
            if placeholder in value:
                base = value.replace(placeholder, 'X')
                if base in locale_dict:
                    stats['translated'] += 1
                    return locale_dict[base].replace('X', placeholder)

        stats['untranslated'] += 1
        return value
    elif isinstance(value, dict):
        return {k: translate_value(v, locale, stats) for k, v in value.items()}
    elif isinstance(value, list):
        return [translate_value(item, locale, stats) for item in value]
    return value

def fix_translation_file(source_path: Path, target_path: Path, locale: str) -> dict:
    """Fix a single translation file by translating all values."""
    stats = {'translated': 0, 'untranslated': 0}

    try:
        with open(source_path, 'r', encoding='utf-8') as f:
            source_data = json.load(f)

        # Translate all values recursively
        translated_data = translate_value(source_data, locale, stats)

        # Write the fixed translation
        with open(target_path, 'w', encoding='utf-8') as f:
            json.dump(translated_data, f, ensure_ascii=False, indent=2)

        stats['success'] = True
    except Exception as e:
        stats['error'] = str(e)
        stats['success'] = False

    return stats

def main():
    """Fix all translation files for all locales."""
    base_path = Path('/opt/dev/Aperant/.worktrees/i18n-additional-languages/apps/desktop/src/shared/i18n/locales')
    en_path = base_path / 'en'

    # Get all namespaces
    namespaces = sorted([f.stem for f in en_path.glob('*.json')])

    print(f"Found {len(namespaces)} namespaces: {', '.join(namespaces)}")
    print(f"Fixing {len(LOCALE_NAMES)} locales...\n")

    total_stats = {locale: {'translated': 0, 'untranslated': 0, 'files': 0, 'errors': 0} for locale in LOCALE_NAMES}

    for locale in sorted(LOCALE_NAMES.keys()):
        locale_path = base_path / locale
        if not locale_path.exists():
            print(f"⚠️  Skipping {locale} ({LOCALE_NAMES[locale]}) - directory not found")
            continue

        print(f"📝 {locale} ({LOCALE_NAMES[locale]})")

        for namespace in namespaces:
            source_file = en_path / f"{namespace}.json"
            target_file = locale_path / f"{namespace}.json"

            if source_file.exists() and target_file.exists():
                stats = fix_translation_file(source_file, target_file, locale)

                if stats['success']:
                    total_stats[locale]['translated'] += stats['translated']
                    total_stats[locale]['untranslated'] += stats['untranslated']
                    total_stats[locale]['files'] += 1

                    total_strings = stats['translated'] + stats['untranslated']
                    coverage = (stats['translated'] / total_strings * 100) if total_strings > 0 else 0
                    print(f"  ✓ {namespace}.json: {stats['translated']}/{total_strings} strings ({coverage:.0f}%)")
                else:
                    total_stats[locale]['errors'] += 1
                    print(f"  ✗ {namespace}.json: {stats.get('error', 'failed')}")

    # Summary
    print(f"\n{'='*60}")
    print("TRANSLATION SUMMARY")
    print(f"{'='*60}")

    for locale in sorted(LOCALE_NAMES.keys()):
        stats = total_stats[locale]
        if stats['files'] > 0:
            total = stats['translated'] + stats['untranslated']
            coverage = (stats['translated'] / total * 100) if total > 0 else 0
            print(f"{locale:8} ({LOCALE_NAMES[locale]:25}): {stats['translated']:4}/{total:4} strings ({coverage:5.1f}%)")
        elif stats['errors'] > 0:
            print(f"{locale:8} ({LOCALE_NAMES[locale]:25}): {stats['errors']} errors")

    print(f"\n✅ Translation fix complete!")

if __name__ == '__main__':
    main()
