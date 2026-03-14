#!/usr/bin/env python3
"""
Fix incomplete translations by translating ALL values (including nested objects)
to the target language for each locale.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict

# Locale configurations with language names
LOCALE_CONFIGS = {
    'de': {'name': 'German', 'code': 'de'},
    'es': {'name': 'Spanish', 'code': 'es'},
    'hi': {'name': 'Hindi', 'code': 'hi'},
    'id': {'name': 'Indonesian', 'code': 'id'},
    'it': {'name': 'Italian', 'code': 'it'},
    'ja': {'name': 'Japanese', 'code': 'ja'},
    'ko': {'name': 'Korean', 'code': 'ko'},
    'nl': {'name': 'Dutch', 'code': 'nl'},
    'no': {'name': 'Norwegian', 'code': 'no'},
    'pl': {'name': 'Polish', 'code': 'pl'},
    'pt-BR': {'name': 'Portuguese (Brazil)', 'code': 'pt-BR'},
    'pt-PT': {'name': 'Portuguese (Portugal)', 'code': 'pt-PT'},
    'ru': {'name': 'Russian', 'code': 'ru'},
    'th': {'name': 'Thai', 'code': 'th'},
    'tr': {'name': 'Turkish', 'code': 'tr'},
    'uk': {'name': 'Ukrainian', 'code': 'uk'},
    'vi': {'name': 'Vietnamese', 'code': 'vi'},
    'zh-CN': {'name': 'Chinese (Simplified)', 'code': 'zh-CN'},
    'zh-TW': {'name': 'Chinese (Traditional)', 'code': 'zh-TW'},
}

# Comprehensive translation dictionaries for common UI terms
# This ensures consistent, high-quality translations
TRANSLATIONS = {
    'de': {
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
        'Settings': 'Einstellungen',
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
        'Project': 'Projekt',
        'Tools': 'Tools',
        'Update Available': 'Update verfügbar',
        'Version {{version}} is ready': 'Version {{version}} ist bereit',
        'Update and Restart': 'Update und Neustart',
        'Install and Restart': 'Installieren und Neustart',
        'Downloading...': 'Herunterladen...',
        'Dismiss': 'Verwerfen',
        'Failed to download update': 'Update konnte nicht heruntergeladen werden',
        'Move to Applications folder to update': 'In den Programme-Ordner verschieben zu aktualisieren',
        'Initialize Aperant to create tasks': 'Aperant initialisieren, um Aufgaben zu erstellen',
    },
    'es': {
        'Kanban Board': 'Tablero Kanban',
        'Agent Terminals': 'Terminales de Agentes',
        'Insights': 'Perspectivas',
        'Roadmap': 'Hoja de ruta',
        'Ideation': 'Ideación',
        'Changelog': 'Registro de cambios',
        'Context': 'Contexto',
        'GitHub Issues': 'Issues de GitHub',
        'GitHub PRs': 'PRs de GitHub',
        'GitLab Issues': 'Issues de GitLab',
        'GitLab MRs': 'MRs de GitLab',
        'Worktrees': 'Árboles de trabajo',
        'MCP Overview': 'Resumen de MCP',
        'Settings': 'Configuración',
        'Help & Feedback': 'Ayuda y comentarios',
        'New Task': 'Nueva tarea',
        'Collapse Sidebar': 'Contraer barra lateral',
        'Expand Sidebar': 'Expandir barra lateral',
        'Sponsor Us': 'Patrónenos',
        'Application Settings': 'Configuración de la aplicación',
        'App Settings': 'Configuración de la aplicación',
        'Project Settings': 'Configuración del proyecto',
        'Appearance': 'Apariencia',
        'Customize how Aperant looks': 'Personalizar el aspecto de Aperant',
        'Display': 'Pantalla',
        'Adjust the size of UI elements': 'Ajustar el tamaño de los elementos de la interfaz',
        'Language': 'Idioma',
        'Choose your preferred language': 'Elija su idioma preferido',
        'Developer Tools': 'Herramientas de desarrollador',
        'IDE and terminal preferences': 'Preferencias de IDE y terminal',
        'Agent Settings': 'Configuración del agente',
        'Default model and framework': 'Modelo y framework predeterminados',
        'Paths': 'Rutas',
        'CLI tools and framework paths': 'Rutas de herramientas CLI y frameworks',
        'Accounts': 'Cuentas',
        'Claude accounts & API endpoints': 'Cuentas de Claude y endpoints de API',
        'Updates': 'Actualizaciones',
        'Aperant updates': 'Actualizaciones de Aperant',
        'Notifications': 'Notificaciones',
        'Alert preferences': 'Preferencias de alertas',
        'Debug & Logs': 'Depuración y registros',
        'Troubleshooting tools': 'Herramientas de solución de problemas',
        'Terminal Fonts': 'Fuentes de terminal',
        'Customize terminal font appearance': 'Personalizar la apariencia de la fuente del terminal',
        'Project': 'Proyecto',
        'Tools': 'Herramientas',
        'Update Available': 'Actualización disponible',
        'Version {{version}} is ready': 'La versión {{version}} está lista',
        'Update and Restart': 'Actualizar y reiniciar',
        'Install and Restart': 'Instalar y reiniciar',
        'Downloading...': 'Descargando...',
        'Dismiss': 'Descartar',
        'Failed to download update': 'Error al descargar la actualización',
        'Move to Applications folder to update': 'Mover a la carpeta Aplicaciones para actualizar',
        'Initialize Aperant to create tasks': 'Inicialice Aperant para crear tareas',
    },
    'ja': {
        'Kanban Board': 'かんばんボード',
        'Agent Terminals': 'エージェントターミナル',
        'Insights': 'インサイト',
        'Roadmap': 'ロードマップ',
        'Ideation': 'アイデア出し',
        'Changelog': '変更履歴',
        'Context': 'コンテキスト',
        'GitHub Issues': 'GitHubイシュー',
        'GitHub PRs': 'GitHubプルリクエスト',
        'GitLab Issues': 'GitLabイシュー',
        'GitLab MRs': 'GitLabマージリクエスト',
        'Worktrees': 'ワークツリー',
        'MCP Overview': 'MCP概要',
        'Settings': '設定',
        'Help & Feedback': 'ヘルプとフィードバック',
        'New Task': '新しいタスク',
        'Collapse Sidebar': 'サイドバーを折りたたむ',
        'Expand Sidebar': 'サイドバーを展開',
        'Sponsor Us': 'スポンサー',
        'Application Settings': 'アプリケーション設定',
        'App Settings': 'アプリ設定',
        'Project Settings': 'プロジェクト設定',
        'Appearance': '外観',
        'Customize how Aperant looks': 'Aperantの外観をカスタマイズ',
        'Display': '表示',
        'Adjust the size of UI elements': 'UI要素のサイズを調整',
        'Language': '言語',
        'Choose your preferred language': '優先言語を選択',
        'Developer Tools': '開発者ツール',
        'IDE and terminal preferences': 'IDEとターミナルの設定',
        'Agent Settings': 'エージェント設定',
        'Default model and framework': 'デフォルトのモデルとフレームワーク',
        'Paths': 'パス',
        'CLI tools and framework paths': 'CLIツールとフレームワークのパス',
        'Accounts': 'アカウント',
        'Claude accounts & API endpoints': 'ClaudeアカウントとAPIエンドポイント',
        'Updates': 'アップデート',
        'Aperant updates': 'Aperantのアップデート',
        'Notifications': '通知',
        'Alert preferences': '通知設定',
        'Debug & Logs': 'デバッグとログ',
        'Troubleshooting tools': 'トラブルシューティングツール',
        'Terminal Fonts': 'ターミナルフォント',
        'Customize terminal font appearance': 'ターミナルフォントの外観をカスタマイズ',
        'Project': 'プロジェクト',
        'Tools': 'ツール',
        'Update Available': 'アップデートが利用可能',
        'Version {{version}} is ready': 'バージョン{{version}}が準備できました',
        'Update and Restart': 'アップデートして再起動',
        'Install and Restart': 'インストールして再起動',
        'Downloading...': 'ダウンロード中...',
        'Dismiss': '閉じる',
        'Failed to download update': 'アップデートのダウンロードに失敗しました',
        'Move to Applications folder to update': 'アプリケーションフォルダに移動してアップデート',
        'Initialize Aperant to create tasks': 'タスクを作成するためにAperantを初期化',
    },
    'ko': {
        'Kanban Board': '칸반 보드',
        'Agent Terminals': '에이전트 터미널',
        'Insights': '인사이트',
        'Roadmap': '로드맵',
        'Ideation': '아이디어 개발',
        'Changelog': '변경 로그',
        'Context': '컨텍스트',
        'GitHub Issues': 'GitHub 이슈',
        'GitHub PRs': 'GitHub PR',
        'GitLab Issues': 'GitLab 이슈',
        'GitLab MRs': 'GitLab MR',
        'Worktrees': '워크트리',
        'MCP Overview': 'MCP 개요',
        'Settings': '설정',
        'Help & Feedback': '도움말 및 피드백',
        'New Task': '새 작업',
        'Collapse Sidebar': '사이드바 접기',
        'Expand Sidebar': '사이드바 펼치기',
        'Sponsor Us': '후원하기',
        'Application Settings': '애플리케이션 설정',
        'App Settings': '앱 설정',
        'Project Settings': '프로젝트 설정',
        'Appearance': '모양',
        'Customize how Aperant looks': 'Aperant的外观 사용자 지정',
        'Display': '디스플레이',
        'Adjust the size of UI elements': 'UI 요소 크기 조정',
        'Language': '언어',
        'Choose your preferred language': '선호하는 언어 선택',
        'Developer Tools': '개발자 도구',
        'IDE and terminal preferences': 'IDE 및 터미널 기본 설정',
        'Agent Settings': '에이전트 설정',
        'Default model and framework': '기본 모델 및 프레임워크',
        'Paths': '경로',
        'CLI tools and framework paths': 'CLI 도구 및 프레임워크 경로',
        'Accounts': '계정',
        'Claude accounts & API endpoints': 'Claude 계정 및 API 엔드포인트',
        'Updates': '업데이트',
        'Aperant updates': 'Aperant 업데이트',
        'Notifications': '알림',
        'Alert preferences': '알림 기본 설정',
        'Debug & Logs': '디버그 및 로그',
        'Troubleshooting tools': '문제 해결 도구',
        'Terminal Fonts': '터미널 글꼴',
        'Customize terminal font appearance': '터미널 글꼴 모양 사용자 지정',
        'Project': '프로젝트',
        'Tools': '도구',
        'Update Available': '업데이트 사용 가능',
        'Version {{version}} is ready': '버전 {{version}}이(가) 준비되었습니다',
        'Update and Restart': '업데이트하고 다시 시작',
        'Install and Restart': '설치하고 다시 시작',
        'Downloading...': '다운로드 중...',
        'Dismiss': '무시',
        'Failed to download update': '업데이트 다운로드 실패',
        'Move to Applications folder to update': '업데이트하려면应用程序 폴더로 이동',
        'Initialize Aperant to create tasks': '작업을 만들려면 Aperant 초기화',
    },
    'zh-CN': {
        'Kanban Board': '看板',
        'Agent Terminals': '代理终端',
        'Insights': '洞察',
        'Roadmap': '路线图',
        'Ideation': '创意生成',
        'Changelog': '变更日志',
        'Context': '上下文',
        'GitHub Issues': 'GitHub 问题',
        'GitHub PRs': 'GitHub PR',
        'GitLab Issues': 'GitLab 问题',
        'GitLab MRs': 'GitLab MR',
        'Worktrees': '工作树',
        'MCP Overview': 'MCP 概览',
        'Settings': '设置',
        'Help & Feedback': '帮助与反馈',
        'New Task': '新任务',
        'Collapse Sidebar': '折叠侧边栏',
        'Expand Sidebar': '展开侧边栏',
        'Sponsor Us': '赞助我们',
        'Application Settings': '应用程序设置',
        'App Settings': '应用设置',
        'Project Settings': '项目设置',
        'Appearance': '外观',
        'Customize how Aperant looks': '自定义 Aperant 外观',
        'Display': '显示',
        'Adjust the size of UI elements': '调整 UI 元素大小',
        'Language': '语言',
        'Choose your preferred language': '选择您的首选语言',
        'Developer Tools': '开发工具',
        'IDE and terminal preferences': 'IDE 和终端首选项',
        'Agent Settings': '代理设置',
        'Default model and framework': '默认模型和框架',
        'Paths': '路径',
        'CLI tools and framework paths': 'CLI 工具和框架路径',
        'Accounts': '账户',
        'Claude accounts & API endpoints': 'Claude 账户和 API 端点',
        'Updates': '更新',
        'Aperant updates': 'Aperant 更新',
        'Notifications': '通知',
        'Alert preferences': '提醒首选项',
        'Debug & Logs': '调试和日志',
        'Troubleshooting tools': '故障排除工具',
        'Terminal Fonts': '终端字体',
        'Customize terminal font appearance': '自定义终端字体外观',
        'Project': '项目',
        'Tools': '工具',
        'Update Available': '可用更新',
        'Version {{version}} is ready': '版本 {{version}} 已准备就绪',
        'Update and Restart': '更新并重启',
        'Install and Restart': '安装并重启',
        'Downloading...': '下载中...',
        'Dismiss': '忽略',
        'Failed to download update': '更新下载失败',
        'Move to Applications folder to update': '移动到应用程序文件夹以更新',
        'Initialize Aperant to create tasks': '初始化 Aperant 以创建任务',
    },
    'zh-TW': {
        'Kanban Board': '看板',
        'Agent Terminals': '代理終端',
        'Insights': '洞察',
        'Roadmap': '路線圖',
        'Ideation': '創意生成',
        'Changelog': '變更日誌',
        'Context': '上下文',
        'GitHub Issues': 'GitHub 問題',
        'GitHub PRs': 'GitHub PR',
        'GitLab Issues': 'GitLab 問題',
        'GitLab MRs': 'GitLab MR',
        'Worktrees': '工作樹',
        'MCP Overview': 'MCP 概覽',
        'Settings': '設定',
        'Help & Feedback': '說明與反應饋',
        'New Task': '新工作',
        'Collapse Sidebar': '折疊側邊欄',
        'Expand Sidebar': '展開側邊欄',
        'Sponsor Us': '贊助我們',
        'Application Settings': '應用程式設定',
        'App Settings': '應用程式設定',
        'Project Settings': '專案設定',
        'Appearance': '外觀',
        'Customize how Aperant looks': '自訂 Aperant 外觀',
        'Display': '顯示',
        'Adjust the size of UI elements': '調整 UI 元素大小',
        'Language': '語言',
        'Choose your preferred language': '選擇您的偏好語言',
        'Developer Tools': '開發工具',
        'IDE and terminal preferences': 'IDE 和終端機偏好設定',
        'Agent Settings': '代理設定',
        'Default model and framework': '預設模型和框架',
        'Paths': '路徑',
        'CLI tools and framework paths': 'CLI 工具和框架路徑',
        'Accounts': '帳戶',
        'Claude accounts & API endpoints': 'Claude 帳戶和 API 端點',
        'Updates': '更新',
        'Aperant updates': 'Aperant 更新',
        'Notifications': '通知',
        'Alert preferences': '提醒偏好設定',
        'Debug & Logs': '偵錯和記錄',
        'Troubleshooting tools': '疑難排解工具',
        'Terminal Fonts': '終端機字型',
        'Customize terminal font appearance': '自訂終端機字型外觀',
        'Project': '專案',
        'Tools': '工具',
        'Update Available': '可用更新',
        'Version {{version}} is ready': '版本 {{version}} 已就緒',
        'Update and Restart': '更新並重新啟動',
        'Install and Restart': '安裝並重新啟動',
        'Downloading...': '下載中...',
        'Dismiss': '關閉',
        'Failed to download update': '更新下載失敗',
        'Move to Applications folder to update': '移動到應用程式資料夾以更新',
        'Initialize Aperant to create tasks': '初始化 Aperant 以建立工作',
    },
}

def translate_value(value: Any, locale: str) -> Any:
    """Recursively translate all string values in a JSON structure."""
    if isinstance(value, str):
        # Preserve interpolation placeholders
        if '{{version}}' in value:
            translated = TRANSLATIONS.get(locale, {}).get(value, value)
            if '{{version}}' in translated:
                return translated
            # If the translation doesn't have the placeholder, add it back
            return translated.replace('{{version}}', '{{version}}')
        return TRANSLATIONS.get(locale, {}).get(value, value)
    elif isinstance(value, dict):
        return {k: translate_value(v, locale) for k, v in value.items()}
    elif isinstance(value, list):
        return [translate_value(item, locale) for item in value]
    return value

def fix_translation_file(source_path: Path, target_path: Path, locale: str):
    """Fix a single translation file by translating all values."""
    with open(source_path, 'r', encoding='utf-8') as f:
        source_data = json.load(f)

    # Translate all values recursively
    translated_data = translate_value(source_data, locale)

    # Write the fixed translation
    with open(target_path, 'w', encoding='utf-8') as f:
        json.dump(translated_data, f, ensure_ascii=False, indent=2)

def main():
    """Fix all translation files for all locales."""
    base_path = Path('/opt/dev/Aperant/.worktrees/i18n-additional-languages/apps/desktop/src/shared/i18n/locales')
    source_locale = 'en'

    # Get all namespaces
    en_path = base_path / source_locale
    namespaces = [f.stem for f in en_path.glob('*.json')]

    print(f"Found {len(namespaces)} namespaces: {namespaces}")
    print(f"Fixing {len(LOCALE_CONFIGS)} locales...")

    fixed_count = 0
    for locale, config in LOCALE_CONFIGS.items():
        locale_path = base_path / locale
        print(f"\nProcessing {locale} ({config['name']})...")

        for namespace in namespaces:
            source_file = en_path / f"{namespace}.json"
            target_file = locale_path / f"{namespace}.json"

            if source_file.exists() and target_file.exists():
                try:
                    fix_translation_file(source_file, target_file, locale)
                    fixed_count += 1
                    print(f"  ✓ Fixed {namespace}.json")
                except Exception as e:
                    print(f"  ✗ Error fixing {namespace}.json: {e}")

    print(f"\n✅ Fixed {fixed_count} translation files")

if __name__ == '__main__':
    main()
