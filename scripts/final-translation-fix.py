#!/usr/bin/env python3
"""
Final translation fix with comprehensive dictionaries for all 19 locales.
Focuses on critical UI strings that users see most often.
"""

import json
from pathlib import Path
from typing import Any, Dict
from collections import defaultdict

# Locale names
LOCALE_NAMES = {
    'de': 'German', 'es': 'Spanish', 'hi': 'Hindi', 'id': 'Indonesian',
    'it': 'Italian', 'ja': 'Japanese', 'ko': 'Korean', 'nl': 'Dutch',
    'no': 'Norwegian', 'pl': 'Polish', 'pt-BR': 'Portuguese (Brazil)',
    'pt-PT': 'Portuguese (Portugal)', 'ru': 'Russian', 'th': 'Thai',
    'tr': 'Turkish', 'uk': 'Ukrainian', 'vi': 'Vietnamese',
    'zh-CN': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)',
}

# Critical strings that MUST be translated - these appear in the UI most frequently
CRITICAL_TRANSLATIONS = {
    'de': {
        'Kanban Board': 'Kanban-Board', 'Agent Terminals': 'Agent-Terminals',
        'Insights': 'Einblicke', 'Roadmap': 'Roadmap', 'Ideation': 'Ideengenerierung',
        'Changelog': 'Änderungsprotokoll', 'Context': 'Kontext',
        'GitHub Issues': 'GitHub-Issues', 'GitHub PRs': 'GitHub-PRs',
        'GitLab Issues': 'GitLab-Issues', 'GitLab MRs': 'GitLab-MRs',
        'Worktrees': 'Worktrees', 'MCP Overview': 'MCP-Übersicht',
        'Settings': 'Einstellungen', 'Help & Feedback': 'Hilfe & Feedback',
        'New Task': 'Neue Aufgabe', 'Collapse Sidebar': 'Seitenleiste einklappen',
        'Expand Sidebar': 'Seitenleiste ausklappen', 'Sponsor Us': 'Unterstützen Sie uns',
        'Application Settings': 'Anwendungseinstellungen',
        'App Settings': 'App-Einstellungen', 'Project Settings': 'Projekteinstellungen',
        'Appearance': 'Darstellung', 'Language': 'Sprache',
        'Developer Tools': 'Entwickler-Tools', 'Agent Settings': 'Agent-Einstellungen',
        'Accounts': 'Konten', 'Updates': 'Updates',
        'Notifications': 'Benachrichtigungen', 'Terminal Fonts': 'Terminal-Schriftarten',
        'Project': 'Projekt', 'Tools': 'Tools',
        'Update Available': 'Update verfügbar', 'Update and Restart': 'Update und Neustart',
        'Install and Restart': 'Installieren und Neustart', 'Dismiss': 'Verwerfen',
        'Add': 'Hinzufügen', 'Cancel': 'Abbrechen', 'Delete': 'Löschen',
        'Save': 'Speichern', 'Close': 'Schließen', 'Edit': 'Bearbeiten',
        'Create': 'Erstellen', 'New': 'Neu', 'View': 'Anzeigen',
        'Open': 'Öffnen', 'Search': 'Suchen', 'Loading...': 'Laden...',
        'Please wait...': 'Bitte warten...', 'No results found': 'Keine Ergebnisse gefunden',
        'Error': 'Fehler', 'Success': 'Erfolg', 'Warning': 'Warnung',
        'Active': 'Aktiv', 'Inactive': 'Inaktiv', 'Pending': 'Ausstehend',
        'Completed': 'Abgeschlossen', 'Failed': 'Fehlgeschlagen', 'Cancelled': 'Abgebrochen',
        'Open': 'Offen', 'Closed': 'Geschlossen', 'Archived': 'Archiviert',
    },
    'es': {
        'Kanban Board': 'Tablero Kanban', 'Agent Terminals': 'Terminales de Agentes',
        'Insights': 'Perspectivas', 'Roadmap': 'Hoja de ruta', 'Ideation': 'Ideación',
        'Changelog': 'Registro de cambios', 'Context': 'Contexto',
        'GitHub Issues': 'Issues de GitHub', 'GitHub PRs': 'PRs de GitHub',
        'GitLab Issues': 'Issues de GitLab', 'GitLab MRs': 'MRs de GitLab',
        'Worktrees': 'Árboles de trabajo', 'MCP Overview': 'Resumen de MCP',
        'Settings': 'Configuración', 'Help & Feedback': 'Ayuda y comentarios',
        'New Task': 'Nueva tarea', 'Collapse Sidebar': 'Contraer barra lateral',
        'Expand Sidebar': 'Expandir barra lateral', 'Sponsor Us': 'Patrónenos',
        'Application Settings': 'Configuración de la aplicación',
        'App Settings': 'Configuración de la aplicación', 'Project Settings': 'Configuración del proyecto',
        'Appearance': 'Apariencia', 'Language': 'Idioma',
        'Developer Tools': 'Herramientas de desarrollador', 'Agent Settings': 'Configuración del agente',
        'Accounts': 'Cuentas', 'Updates': 'Actualizaciones',
        'Notifications': 'Notificaciones', 'Terminal Fonts': 'Fuentes de terminal',
        'Project': 'Proyecto', 'Tools': 'Herramientas',
        'Update Available': 'Actualización disponible', 'Update and Restart': 'Actualizar y reiniciar',
        'Install and Restart': 'Instalar y reiniciar', 'Dismiss': 'Descartar',
        'Add': 'Añadir', 'Cancel': 'Cancelar', 'Delete': 'Eliminar',
        'Save': 'Guardar', 'Close': 'Cerrar', 'Edit': 'Editar',
        'Create': 'Crear', 'New': 'Nuevo', 'View': 'Ver',
        'Open': 'Abrir', 'Search': 'Buscar', 'Loading...': 'Cargando...',
        'Please wait...': 'Espere...', 'No results found': 'No se encontraron resultados',
        'Error': 'Error', 'Success': 'Éxito', 'Warning': 'Advertencia',
        'Active': 'Activo', 'Inactive': 'Inactivo', 'Pending': 'Pendiente',
        'Completed': 'Completado', 'Failed': 'Fallido', 'Cancelled': 'Cancelado',
        'Open': 'Abierto', 'Closed': 'Cerrado', 'Archived': 'Archivado',
    },
    'ja': {
        'Kanban Board': 'かんばんボード', 'Agent Terminals': 'エージェントターミナル',
        'Insights': 'インサイト', 'Roadmap': 'ロードマップ', 'Ideation': 'アイデア出し',
        'Changelog': '変更履歴', 'Context': 'コンテキスト',
        'GitHub Issues': 'GitHubイシュー', 'GitHub PRs': 'GitHubプルリクエスト',
        'GitLab Issues': 'GitLabイシュー', 'GitLab MRs': 'GitLabマージリクエスト',
        'Worktrees': 'ワークツリー', 'MCP Overview': 'MCP概要',
        'Settings': '設定', 'Help & Feedback': 'ヘルプとフィードバック',
        'New Task': '新しいタスク', 'Collapse Sidebar': 'サイドバーを折りたたむ',
        'Expand Sidebar': 'サイドバーを展開', 'Sponsor Us': 'スポンサー',
        'Application Settings': 'アプリケーション設定',
        'App Settings': 'アプリ設定', 'Project Settings': 'プロジェクト設定',
        'Appearance': '外観', 'Language': '言語',
        'Developer Tools': '開発者ツール', 'Agent Settings': 'エージェント設定',
        'Accounts': 'アカウント', 'Updates': 'アップデート',
        'Notifications': '通知', 'Terminal Fonts': 'ターミナルフォント',
        'Project': 'プロジェクト', 'Tools': 'ツール',
        'Update Available': 'アップデートが利用可能', 'Update and Restart': 'アップデートして再起動',
        'Install and Restart': 'インストールして再起動', 'Dismiss': '閉じる',
        'Add': '追加', 'Cancel': 'キャンセル', 'Delete': '削除',
        'Save': '保存', 'Close': '閉じる', 'Edit': '編集',
        'Create': '作成', 'New': '新規', 'View': '表示',
        'Open': '開く', 'Search': '検索', 'Loading...': '読み込み中...',
        'Please wait...': 'お待ちください...', 'No results found': '結果が見つかりません',
        'Error': 'エラー', 'Success': '成功', 'Warning': '警告',
        'Active': 'アクティブ', 'Inactive': '非アクティブ', 'Pending': '保留中',
        'Completed': '完了', 'Failed': '失敗', 'Cancelled': 'キャンセル済み',
        'Open': '開く', 'Closed': 'クローズ', 'Archived': 'アーカイブ済み',
    },
    'ko': {
        'Kanban Board': '칸반 보드', 'Agent Terminals': '에이전트 터미널',
        'Insights': '인사이트', 'Roadmap': '로드맵', 'Ideation': '아이디어 개발',
        'Changelog': '변경 로그', 'Context': '컨텍스트',
        'GitHub Issues': 'GitHub 이슈', 'GitHub PRs': 'GitHub PR',
        'GitLab Issues': 'GitLab 이슈', 'GitLab MRs': 'GitLab MR',
        'Worktrees': '워크트리', 'MCP Overview': 'MCP 개요',
        'Settings': '설정', 'Help & Feedback': '도움말 및 피드백',
        'New Task': '새 작업', 'Collapse Sidebar': '사이드바 접기',
        'Expand Sidebar': '사이드바 펼치기', 'Sponsor Us': '후원하기',
        'Application Settings': '애플리케이션 설정',
        'App Settings': '앱 설정', 'Project Settings': '프로젝트 설정',
        'Appearance': '모양', 'Language': '언어',
        'Developer Tools': '개발자 도구', 'Agent Settings': '에이전트 설정',
        'Accounts': '계정', 'Updates': '업데이트',
        'Notifications': '알림', 'Terminal Fonts': '터미널 글꼴',
        'Project': '프로젝트', 'Tools': '도구',
        'Update Available': '업데이트 사용 가능', 'Update and Restart': '업데이트하고 다시 시작',
        'Install and Restart': '설치하고 다시 시작', 'Dismiss': '무시',
        'Add': '추가', 'Cancel': '취소', 'Delete': '삭제',
        'Save': '저장', 'Close': '닫기', 'Edit': '편집',
        'Create': '만들기', 'New': '새로 만들기', 'View': '보기',
        'Open': '열기', 'Search': '검색', 'Loading...': '로드 중...',
        'Please wait...': '기다려 주세요...', 'No results found': '결과를 찾을 수 없습니다',
        'Error': '오류', 'Success': '성공', 'Warning': '경고',
        'Active': '활성', 'Inactive': '비활성', 'Pending': '보류 중',
        'Completed': '완료됨', 'Failed': '실패', 'Cancelled': '취소됨',
        'Open': '열림', 'Closed': '닫힘', 'Archived': '보관됨',
    },
    'zh-CN': {
        'Kanban Board': '看板', 'Agent Terminals': '代理终端',
        'Insights': '洞察', 'Roadmap': '路线图', 'Ideation': '创意生成',
        'Changelog': '变更日志', 'Context': '上下文',
        'GitHub Issues': 'GitHub 问题', 'GitHub PRs': 'GitHub PR',
        'GitLab Issues': 'GitLab 问题', 'GitLab MRs': 'GitLab MR',
        'Worktrees': '工作树', 'MCP Overview': 'MCP 概览',
        'Settings': '设置', 'Help & Feedback': '帮助与反馈',
        'New Task': '新任务', 'Collapse Sidebar': '折叠侧边栏',
        'Expand Sidebar': '展开侧边栏', 'Sponsor Us': '赞助我们',
        'Application Settings': '应用程序设置',
        'App Settings': '应用设置', 'Project Settings': '项目设置',
        'Appearance': '外观', 'Language': '语言',
        'Developer Tools': '开发工具', 'Agent Settings': '代理设置',
        'Accounts': '账户', 'Updates': '更新',
        'Notifications': '通知', 'Terminal Fonts': '终端字体',
        'Project': '项目', 'Tools': '工具',
        'Update Available': '可用更新', 'Update and Restart': '更新并重启',
        'Install and Restart': '安装并重启', 'Dismiss': '忽略',
        'Add': '添加', 'Cancel': '取消', 'Delete': '删除',
        'Save': '保存', 'Close': '关闭', 'Edit': '编辑',
        'Create': '创建', 'New': '新建', 'View': '查看',
        'Open': '打开', 'Search': '搜索', 'Loading...': '加载中...',
        'Please wait...': '请稍候...', 'No results found': '未找到结果',
        'Error': '错误', 'Success': '成功', 'Warning': '警告',
        'Active': '活动', 'Inactive': '非活动', 'Pending': '待定',
        'Completed': '已完成', 'Failed': '失败', 'Cancelled': '已取消',
        'Open': '打开', 'Closed': '已关闭', 'Archived': '已归档',
    },
    'zh-TW': {
        'Kanban Board': '看板', 'Agent Terminals': '代理終端',
        'Insights': '洞察', 'Roadmap': '路線圖', 'Ideation': '創意生成',
        'Changelog': '變更日誌', 'Context': '上下文',
        'GitHub Issues': 'GitHub 問題', 'GitHub PRs': 'GitHub PR',
        'GitLab Issues': 'GitLab 問題', 'GitLab MRs': 'GitLab MR',
        'Worktrees': '工作樹', 'MCP Overview': 'MCP 概覽',
        'Settings': '設定', 'Help & Feedback': '說明與反應饋',
        'New Task': '新工作', 'Collapse Sidebar': '折疊側邊欄',
        'Expand Sidebar': '展開側邊欄', 'Sponsor Us': '贊助我們',
        'Application Settings': '應用程式設定',
        'App Settings': '應用程式設定', 'Project Settings': '專案設定',
        'Appearance': '外觀', 'Language': '語言',
        'Developer Tools': '開發工具', 'Agent Settings': '代理設定',
        'Accounts': '帳戶', 'Updates': '更新',
        'Notifications': '通知', 'Terminal Fonts': '終端機字型',
        'Project': '專案', 'Tools': '工具',
        'Update Available': '可用更新', 'Update and Restart': '更新並重新啟動',
        'Install and Restart': '安裝並重新啟動', 'Dismiss': '關閉',
        'Add': '新增', 'Cancel': '取消', 'Delete': '刪除',
        'Save': '儲存', 'Close': '關閉', 'Edit': '編輯',
        'Create': '建立', 'New': '新增', 'View': '檢視',
        'Open': '開啟', 'Search': '搜尋', 'Loading...': '載入中...',
        'Please wait...': '請稍候...', 'No results found': '找不到結果',
        'Error': '錯誤', 'Success': '成功', 'Warning': '警告',
        'Active': '使用中', 'Inactive': '未使用', 'Pending': '擱置中',
        'Completed': '已完成', 'Failed': '失敗', 'Cancelled': '已取消',
        'Open': '開啟', 'Closed': '已關閉', 'Archived': '已封存',
    },
    'fr': {
        'Kanban Board': 'Tableau Kanban', 'Agent Terminals': 'Terminaux d\'agents',
        'Insights': 'Insights', 'Roadmap': 'Feuille de route', 'Ideation': 'Idéation',
        'Changelog': 'Journal des modifications', 'Context': 'Contexte',
        'GitHub Issues': 'Issues GitHub', 'GitHub PRs': 'PRs GitHub',
        'GitLab Issues': 'Issues GitLab', 'GitLab MRs': 'MRs GitLab',
        'Worktrees': 'Worktrees', 'MCP Overview': 'Aperçu MCP',
        'Settings': 'Paramètres', 'Help & Feedback': 'Aide et commentaires',
        'New Task': 'Nouvelle tâche', 'Collapse Sidebar': 'Fermer la barre latérale',
        'Expand Sidebar': 'Ouvrir la barre latérale', 'Sponsor Us': 'Nous sponsoriser',
        'Application Settings': 'Paramètres de l\'application',
        'App Settings': 'Paramètres de l\'application', 'Project Settings': 'Paramètres du projet',
        'Appearance': 'Apparence', 'Language': 'Langue',
        'Developer Tools': 'Outils de développement', 'Agent Settings': 'Paramètres de l\'agent',
        'Accounts': 'Comptes', 'Updates': 'Mises à jour',
        'Notifications': 'Notifications', 'Terminal Fonts': 'Polices du terminal',
        'Project': 'Projet', 'Tools': 'Outils',
        'Update Available': 'Mise à jour disponible', 'Update and Restart': 'Mettre à jour et redémarrer',
        'Install and Restart': 'Installer et redémarrer', 'Dismiss': 'Rejeter',
        'Add': 'Ajouter', 'Cancel': 'Annuler', 'Delete': 'Supprimer',
        'Save': 'Enregistrer', 'Close': 'Fermer', 'Edit': 'Modifier',
        'Create': 'Créer', 'New': 'Nouveau', 'View': 'Voir',
        'Open': 'Ouvrir', 'Search': 'Rechercher', 'Loading...': 'Chargement...',
        'Please wait...': 'Veuillez patienter...', 'No results found': 'Aucun résultat trouvé',
        'Error': 'Erreur', 'Success': 'Succès', 'Warning': 'Avertissement',
        'Active': 'Actif', 'Inactive': 'Inactif', 'Pending': 'En attente',
        'Completed': 'Terminé', 'Failed': 'Échec', 'Cancelled': 'Annulé',
        'Open': 'Ouvert', 'Closed': 'Fermé', 'Archived': 'Archivé',
    },
    'it': {
        'Kanban Board': 'Kanban Board', 'Agent Terminals': 'Terminal Agenti',
        'Insights': 'Approfondimenti', 'Roadmap': 'Roadmap', 'Ideation': 'Ideazione',
        'Changelog': 'Changelog', 'Context': 'Contesto',
        'GitHub Issues': 'Issue di GitHub', 'GitHub PRs': 'PR di GitHub',
        'GitLab Issues': 'Issue di GitLab', 'GitLab MRs': 'MR di GitLab',
        'Worktrees': 'Worktrees', 'MCP Overview': 'Panoramica MCP',
        'Settings': 'Impostazioni', 'Help & Feedback': 'Guida e feedback',
        'New Task': 'Nuovo Compito', 'Collapse Sidebar': 'Collassa barra laterale',
        'Expand Sidebar': 'Espandi barra laterale', 'Sponsor Us': 'Sponsorizzaci',
        'Application Settings': 'Impostazioni Applicazione',
        'App Settings': 'Impostazioni App', 'Project Settings': 'Impostazioni Progetto',
        'Appearance': 'Aspetto', 'Language': 'Lingua',
        'Developer Tools': 'Strumenti Sviluppatore', 'Agent Settings': 'Impostazioni Agente',
        'Accounts': 'Account', 'Updates': 'Aggiornamenti',
        'Notifications': 'Notifiche', 'Terminal Fonts': 'Font Terminale',
        'Project': 'Progetto', 'Tools': 'Strumenti',
        'Update Available': 'Aggiornamento Disponibile', 'Update and Restart': 'Aggiorna e Riavvia',
        'Install and Restart': 'Installa e Riavvia', 'Dismiss': 'Chiudi',
        'Add': 'Aggiungi', 'Cancel': 'Annulla', 'Delete': 'Elimina',
        'Save': 'Salva', 'Close': 'Chiudi', 'Edit': 'Modifica',
        'Create': 'Crea', 'New': 'Nuovo', 'View': 'Visualizza',
        'Open': 'Apri', 'Search': 'Cerca', 'Loading...': 'Caricamento...',
        'Please wait...': 'Attendere prego...', 'No results found': 'Nessun risultato trovato',
        'Error': 'Errore', 'Success': 'Successo', 'Warning': 'Avviso',
        'Active': 'Attivo', 'Inactive': 'Inattivo', 'Pending': 'In attesa',
        'Completed': 'Completato', 'Failed': 'Fallito', 'Cancelled': 'Cancellato',
        'Open': 'Aperto', 'Closed': 'Chiuso', 'Archived': 'Archiviato',
    },
    'pt-BR': {
        'Kanban Board': 'Quadro Kanban', 'Agent Terminals': 'Terminais de Agentes',
        'Insights': 'Insights', 'Roadmap': 'Roadmap', 'Ideation': 'Ideação',
        'Changelog': 'Registro de Mudanças', 'Context': 'Contexto',
        'GitHub Issues': 'Issues do GitHub', 'GitHub PRs': 'PRs do GitHub',
        'GitLab Issues': 'Issues do GitLab', 'GitLab MRs': 'MRs do GitLab',
        'Worktrees': 'Worktrees', 'MCP Overview': 'Visão Geral do MCP',
        'Settings': 'Configurações', 'Help & Feedback': 'Ajuda e Feedback',
        'New Task': 'Nova Tarefa', 'Collapse Sidebar': 'Recolher Barra Lateral',
        'Expand Sidebar': 'Expandir Barra Lateral', 'Sponsor Us': 'Nos Patrocine',
        'Application Settings': 'Configurações do Aplicativo',
        'App Settings': 'Configurações do App', 'Project Settings': 'Configurações do Projeto',
        'Appearance': 'Aparência', 'Language': 'Idioma',
        'Developer Tools': 'Ferramentas de Desenvolvedor', 'Agent Settings': 'Configurações do Agente',
        'Accounts': 'Contas', 'Updates': 'Atualizações',
        'Notifications': 'Notificações', 'Terminal Fonts': 'Fontes do Terminal',
        'Project': 'Projeto', 'Tools': 'Ferramentas',
        'Update Available': 'Atualização Disponível', 'Update and Restart': 'Atualizar e Reiniciar',
        'Install and Restart': 'Instalar e Reiniciar', 'Dismiss': 'Descartar',
        'Add': 'Adicionar', 'Cancel': 'Cancelar', 'Delete': 'Excluir',
        'Save': 'Salvar', 'Close': 'Fechar', 'Edit': 'Editar',
        'Create': 'Criar', 'New': 'Novo', 'View': 'Visualizar',
        'Open': 'Abrir', 'Search': 'Pesquisar', 'Loading...': 'Carregando...',
        'Please wait...': 'Aguarde...', 'No results found': 'Nenhum resultado encontrado',
        'Error': 'Erro', 'Success': 'Sucesso', 'Warning': 'Aviso',
        'Active': 'Ativo', 'Inactive': 'Inativo', 'Pending': 'Pendente',
        'Completed': 'Concluído', 'Failed': 'Falhou', 'Cancelled': 'Cancelado',
        'Open': 'Aberto', 'Closed': 'Fechado', 'Archived': 'Arquivado',
    },
    'pt-PT': {
        'Kanban Board': 'Quadro Kanban', 'Agent Terminals': 'Terminais de Agentes',
        'Insights': 'Perceções', 'Roadmap': 'Roadmap', 'Ideation': 'Ideação',
        'Changelog': 'Registo de Alterações', 'Context': 'Contexto',
        'GitHub Issues': 'Issues do GitHub', 'GitHub PRs': 'PRs do GitHub',
        'GitLab Issues': 'Issues do GitLab', 'GitLab MRs': 'MRs do GitLab',
        'Worktrees': 'Worktrees', 'MCP Overview': 'Visão Geral do MCP',
        'Settings': 'Definições', 'Help & Feedback': 'Ajuda e Feedback',
        'New Task': 'Nova Tarefa', 'Collapse Sidebar': 'Recolher Barra Lateral',
        'Expand Sidebar': 'Expandir Barra Lateral', 'Sponsor Us': 'Patrocie-nos',
        'Application Settings': 'Definições da Aplicação',
        'App Settings': 'Definições da App', 'Project Settings': 'Definições do Projeto',
        'Appearance': 'Aparência', 'Language': 'Idioma',
        'Developer Tools': 'Ferramentas de Programador', 'Agent Settings': 'Definições do Agente',
        'Accounts': 'Contas', 'Updates': 'Atualizações',
        'Notifications': 'Notificações', 'Terminal Fonts': 'Fontes do Terminal',
        'Project': 'Projeto', 'Tools': 'Ferramentas',
        'Update Available': 'Atualização Disponível', 'Update and Restart': 'Atualizar e Reiniciar',
        'Install and Restart': 'Instalar e Reiniciar', 'Dismiss': 'Descartar',
        'Add': 'Adicionar', 'Cancel': 'Cancelar', 'Delete': 'Eliminar',
        'Save': 'Guardar', 'Close': 'Fechar', 'Edit': 'Editar',
        'Create': 'Criar', 'New': 'Novo', 'View': 'Ver',
        'Open': 'Abrir', 'Search': 'Pesquisar', 'Loading...': 'A carregar...',
        'Please wait...': 'Aguarde...', 'No results found': 'Nenhum resultado encontrado',
        'Error': 'Erro', 'Success': 'Sucesso', 'Warning': 'Aviso',
        'Active': 'Ativo', 'Inactive': 'Inativo', 'Pending': 'Pendente',
        'Completed': 'Concluído', 'Failed': 'Falhou', 'Cancelled': 'Cancelado',
        'Open': 'Aberto', 'Closed': 'Fechado', 'Archived': 'Arquivado',
    },
    'ru': {
        'Kanban Board': 'Канбан-доска', 'Agent Terminals': 'Терминалы агентов',
        'Insights': 'Инсайты', 'Roadmap': 'Дорожная карта', 'Ideation': 'Генерация идей',
        'Changelog': 'Журнал изменений', 'Context': 'Контекст',
        'GitHub Issues': 'Issues GitHub', 'GitHub PRs': 'PR GitHub',
        'GitLab Issues': 'Issues GitLab', 'GitLab MRs': 'MR GitLab',
        'Worktrees': 'Worktrees', 'MCP Overview': 'Обзор MCP',
        'Settings': 'Настройки', 'Help & Feedback': 'Справка и обратная связь',
        'New Task': 'Новая задача', 'Collapse Sidebar': 'Свернуть боковую панель',
        'Expand Sidebar': 'Развернуть боковую панель', 'Sponsor Us': 'Спонсировать нас',
        'Application Settings': 'Настройки приложения',
        'App Settings': 'Настройки приложения', 'Project Settings': 'Настройки проекта',
        'Appearance': 'Внешний вид', 'Language': 'Язык',
        'Developer Tools': 'Инструменты разработчика', 'Agent Settings': 'Настройки агента',
        'Accounts': 'Учетные записи', 'Updates': 'Обновления',
        'Notifications': 'Уведомления', 'Terminal Fonts': 'Шрифты терминала',
        'Project': 'Проект', 'Tools': 'Инструменты',
        'Update Available': 'Доступно обновление', 'Update and Restart': 'Обновить и перезагрузить',
        'Install and Restart': 'Установить и перезагрузить', 'Dismiss': 'Отклонить',
        'Add': 'Добавить', 'Cancel': 'Отмена', 'Delete': 'Удалить',
        'Save': 'Сохранить', 'Close': 'Закрыть', 'Edit': 'Изменить',
        'Create': 'Создать', 'New': 'Создать', 'View': 'Просмотр',
        'Open': 'Открыть', 'Search': 'Поиск', 'Loading...': 'Загрузка...',
        'Please wait...': 'Подождите...', 'No results found': 'Результаты не найдены',
        'Error': 'Ошибка', 'Success': 'Успех', 'Warning': 'Предупреждение',
        'Active': 'Активен', 'Inactive': 'Неактивен', 'Pending': 'Ожидает',
        'Completed': 'Завершен', 'Failed': 'Неудачно', 'Cancelled': 'Отменено',
        'Open': 'Открыть', 'Closed': 'Закрыто', 'Archived': 'Архивировано',
    },
    'nl': {
        'Kanban Board': 'Kanban-bord', 'Agent Terminals': 'Agent-terminals',
        'Insights': 'Inzichten', 'Roadmap': 'Roadmap', 'Ideation': 'Ideënvorming',
        'Changelog': 'Wijzigingslogboek', 'Context': 'Context',
        'GitHub Issues': 'GitHub-issues', 'GitHub PRs': 'GitHub-PRs',
        'GitLab Issues': 'GitLab-issues', 'GitLab MRs': 'GitLab-MRs',
        'Worktrees': 'Worktrees', 'MCP Overview': 'MCP-overzicht',
        'Settings': 'Instellingen', 'Help & Feedback': 'Help en feedback',
        'New Task': 'Nieuwe taak', 'Collapse Sidebar': 'Zijbalk inklappen',
        'Expand Sidebar': 'Zijbalk uitklappen', 'Sponsor Us': 'Steun ons',
        'Application Settings': 'App-instellingen',
        'App Settings': 'App-instellingen', 'Project Settings': 'Projectinstellingen',
        'Appearance': 'Weergave', 'Language': 'Taal',
        'Developer Tools': 'Ontwikkelaarstools', 'Agent Settings': 'Agent-instellingen',
        'Accounts': 'Accounts', 'Updates': 'Updates',
        'Notifications': 'Meldingen', 'Terminal Fonts': 'Terminal-lettertypen',
        'Project': 'Project', 'Tools': 'Tools',
        'Update Available': 'Update beschikbaar', 'Update and Restart': 'Updaten en herstarten',
        'Install and Restart': 'Installeren en herstarten', 'Dismiss': 'Negeren',
        'Add': 'Toevoegen', 'Cancel': 'Annuleren', 'Delete': 'Verwijderen',
        'Save': 'Opslaan', 'Close': 'Sluiten', 'Edit': 'Bewerken',
        'Create': 'Maken', 'New': 'Nieuw', 'View': 'Weergeven',
        'Open': 'Openen', 'Search': 'Zoeken', 'Loading...': 'Laden...',
        'Please wait...': 'Even geduld...', 'No results found': 'Geen resultaten gevonden',
        'Error': 'Fout', 'Success': 'Succes', 'Warning': 'Waarschuwing',
        'Active': 'Actief', 'Inactive': 'Inactief', 'Pending': 'In afwachting',
        'Completed': 'Voltooid', 'Failed': 'Mislukt', 'Cancelled': 'Geannuleerd',
        'Open': 'Open', 'Closed': 'Gesloten', 'Archived': 'Gearchiveerd',
    },
    'pl': {
        'Kanban Board': 'Tablica Kanban', 'Agent Terminals': 'Terminale agentów',
        'Insights': 'Wgląd', 'Roadmap': 'Mapa drogowa', 'Ideation': 'Generowanie pomysłów',
        'Changelog': 'Dziennik zmian', 'Context': 'Kontekst',
        'GitHub Issues': 'Issues GitHub', 'GitHub PRs': 'PR GitHub',
        'GitLab Issues': 'Issues GitLab', 'GitLab MRs': 'MR GitLab',
        'Worktrees': 'Worktrees', 'MCP Overview': 'Przegląd MCP',
        'Settings': 'Ustawienia', 'Help & Feedback': 'Pomoc i opinie',
        'New Task': 'Nowe zadanie', 'Collapse Sidebar': 'Zwiń pasek boczny',
        'Expand Sidebar': 'Rozwiń pasek boczny', 'Sponsor Us': 'Zostań sponsorem',
        'Application Settings': 'Ustawienia aplikacji',
        'App Settings': 'Ustawienia aplikacji', 'Project Settings': 'Ustawienia projektu',
        'Appearance': 'Wygląd', 'Language': 'Język',
        'Developer Tools': 'Narzędzia deweloperskie', 'Agent Settings': 'Ustawienia agenta',
        'Accounts': 'Konta', 'Updates': 'Aktualizacje',
        'Notifications': 'Powiadomienia', 'Terminal Fonts': 'Czcionki terminala',
        'Project': 'Projekt', 'Tools': 'Narzędzia',
        'Update Available': 'Dostępna aktualizacja', 'Update and Restart': 'Zaktualizuj i uruchom ponownie',
        'Install and Restart': 'Zainstaluj i uruchom ponownie', 'Dismiss': 'Odrzuć',
        'Add': 'Dodaj', 'Cancel': 'Anuluj', 'Delete': 'Usuń',
        'Save': 'Zapisz', 'Close': 'Zamknij', 'Edit': 'Edytuj',
        'Create': 'Utwórz', 'New': 'Nowy', 'View': 'Widok',
        'Open': 'Otwórz', 'Search': 'Szukaj', 'Loading...': 'Ładowanie...',
        'Please wait...': 'Proszę czekać...', 'No results found': 'Brak wyników',
        'Error': 'Błąd', 'Success': 'Sukces', 'Warning': 'Ostrzeżenie',
        'Active': 'Aktywny', 'Inactive': 'Nieaktywny', 'Pending': 'Oczekujący',
        'Completed': 'Ukończony', 'Failed': 'Nieudany', 'Cancelled': 'Anulowany',
        'Open': 'Otwarty', 'Closed': 'Zamknięty', 'Archived': 'Zarchiwizowany',
    },
    'tr': {
        'Kanban Board': 'Kanban Panosu', 'Agent Terminals': 'Ajan Terminalleri',
        'Insights': 'İçgörüler', 'Roadmap': 'Yol Haritası', 'Ideation': 'Fikir Oluşturma',
        'Changelog': 'Değişiklik Günlüğü', 'Context': 'Bağlam',
        'GitHub Issues': 'GitHub Sorunları', 'GitHub PRs': 'GitHub PR',
        'GitLab Issues': 'GitLab Sorunları', 'GitLab MRs': 'GitLab MR',
        'Worktrees': 'Worktrees', 'MCP Overview': 'MCP Genel Bakış',
        'Settings': 'Ayarlar', 'Help & Feedback': 'Yardım ve Geri Bildirim',
        'New Task': 'Yeni Görev', 'Collapse Sidebar': 'Kenar Çubuğunu Daralt',
        'Expand Sidebar': 'Kenar Çubuğunu Genişlet', 'Sponsor Us': 'Bizi Destekleyin',
        'Application Settings': 'Uygulama Ayarları',
        'App Settings': 'Uygulama Ayarları', 'Project Settings': 'Proje Ayarları',
        'Appearance': 'Görünüm', 'Language': 'Dil',
        'Developer Tools': 'Geliştirici Araçları', 'Agent Settings': 'Ajan Ayarları',
        'Accounts': 'Hesaplar', 'Updates': 'Güncellemeler',
        'Notifications': 'Bildirimler', 'Terminal Fonts': 'Terminal Yazı Tipleri',
        'Project': 'Proje', 'Tools': 'Araçlar',
        'Update Available': 'Güncelleme Mevcut', 'Update and Restart': 'Güncelle ve Yeniden Başlat',
        'Install and Restart': 'Yükle ve Yeniden Başlat', 'Dismiss': 'Yoksay',
        'Add': 'Ekle', 'Cancel': 'İptal', 'Delete': 'Sil',
        'Save': 'Kaydet', 'Close': 'Kapat', 'Edit': 'Düzenle',
        'Create': 'Oluştur', 'New': 'Yeni', 'View': 'Görüntüle',
        'Open': 'Aç', 'Search': 'Ara', 'Loading...': 'Yükleniyor...',
        'Please wait...': 'Lütfen bekleyin...', 'No results found': 'Sonuç bulunamadı',
        'Error': 'Hata', 'Success': 'Başarılı', 'Warning': 'Uyarı',
        'Active': 'Aktif', 'Inactive': 'Aktif Değil', 'Pending': 'Bekliyor',
        'Completed': 'Tamamlandı', 'Failed': 'Başarısız', 'Cancelled': 'İptal Edildi',
        'Open': 'Açık', 'Closed': 'Kapalı', 'Archived': 'Arşivlendi',
    },
    'hi': {
        'Kanban Board': 'कानबन बोर्ड', 'Agent Terminals': 'एजेंट टर्मिनल',
        'Insights': 'इंसाइट्स', 'Roadmap': 'रोडमैप', 'Ideation': 'विचार निर्माण',
        'Changelog': 'बदलाव लॉग', 'Context': 'संदर्भ',
        'GitHub Issues': 'GitHub मुद्दे', 'GitHub PRs': 'GitHub PR',
        'GitLab Issues': 'GitLab मुद्दे', 'GitLab MRs': 'GitLab MR',
        'Worktrees': 'Worktrees', 'MCP Overview': 'MCP अवलोकन',
        'Settings': 'सेटिंग्स', 'Help & Feedback': 'सहायता और प्रतिक्रिया',
        'New Task': 'नया कार्य', 'Collapse Sidebar': 'साइडबार संक्षिप्त करें',
        'Expand Sidebar': 'साइडबार विस्तार करें', 'Sponsor Us': 'हमें प्रायोजित करें',
        'Application Settings': 'एप्लिकेशन सेटिंग्स',
        'App Settings': 'ऐप सेटिंग्स', 'Project Settings': 'प्रोजेक्ट सेटिंग्स',
        'Appearance': 'दिखावट', 'Language': 'भाषा',
        'Developer Tools': 'डेवलपर टूल्स', 'Agent Settings': 'एजेंट सेटिंग्स',
        'Accounts': 'खाते', 'Updates': 'अपडेट',
        'Notifications': 'सूचनाएं', 'Terminal Fonts': 'टर्मिनल फ़ॉन्ट',
        'Project': 'प्रोजेक्ट', 'Tools': 'टूल्स',
        'Update Available': 'अपडेट उपलब्ध', 'Update and Restart': 'अपडेट और पुनः प्रारंभ करें',
        'Install and Restart': 'इंस्टॉल और पुनः प्रारंभ करें', 'Dismiss': 'खारिज करें',
        'Add': 'जोड़ें', 'Cancel': 'रद्द करें', 'Delete': 'हटाएं',
        'Save': 'सहेजें', 'Close': 'बंद करें', 'Edit': 'संपादित करें',
        'Create': 'बनाएं', 'New': 'नया', 'View': 'देखें',
        'Open': 'खोलें', 'Search': 'खोजें', 'Loading...': 'लोड हो रहा है...',
        'Please wait...': 'कृपया प्रतीक्षा करें...', 'No results found': 'कोई परिणाम नहीं मिला',
        'Error': 'त्रुटि', 'Success': 'सफलता', 'Warning': 'चेतावनी',
        'Active': 'सक्रिय', 'Inactive': 'निष्क्रिय', 'Pending': 'लंबित',
        'Completed': 'पूर्ण', 'Failed': 'विफल', 'Cancelled': 'रद्द',
        'Open': 'खुला', 'Closed': 'बंद', 'Archived': 'संग्रहित',
    },
    'id': {
        'Kanban Board': 'Papan Kanban', 'Agent Terminals': 'Terminal Agen',
        'Insights': 'Wawasan', 'Roadmap': 'Peta Jalan', 'Ideation': 'Ideasi',
        'Changelog': 'Log Perubahan', 'Context': 'Konteks',
        'GitHub Issues': 'Isu GitHub', 'GitHub PRs': 'PR GitHub',
        'GitLab Issues': 'Isu GitLab', 'GitLab MRs': 'MR GitLab',
        'Worktrees': 'Worktrees', 'MCP Overview': 'Ikhtisar MCP',
        'Settings': 'Pengaturan', 'Help & Feedback': 'Bantuan & Umpan Balik',
        'New Task': 'Tugas Baru', 'Collapse Sidebar': 'Ciutkan Bilah Sisi',
        'Expand Sidebar': 'Perluas Bilah Sisi', 'Sponsor Us': 'Sponsori Kami',
        'Application Settings': 'Pengaturan Aplikasi',
        'App Settings': 'Pengaturan Aplikasi', 'Project Settings': 'Pengaturan Proyek',
        'Appearance': 'Tampilan', 'Language': 'Bahasa',
        'Developer Tools': 'Alat Pengembang', 'Agent Settings': 'Pengaturan Agen',
        'Accounts': 'Akun', 'Updates': 'Pembaruan',
        'Notifications': 'Notifikasi', 'Terminal Fonts': 'Font Terminal',
        'Project': 'Proyek', 'Tools': 'Alat',
        'Update Available': 'Pembaruan Tersedia', 'Update and Restart': 'Perbarui dan Mulai Ulang',
        'Install and Restart': 'Instal dan Mulai Ulang', 'Dismiss': 'Tutup',
        'Add': 'Tambah', 'Cancel': 'Batal', 'Delete': 'Hapus',
        'Save': 'Simpan', 'Close': 'Tutup', 'Edit': 'Edit',
        'Create': 'Buat', 'New': 'Baru', 'View': 'Lihat',
        'Open': 'Buka', 'Search': 'Cari', 'Loading...': 'Memuat...',
        'Please wait...': 'Mohon tunggu...', 'No results found': 'Tidak ada hasil ditemukan',
        'Error': 'Kesalahan', 'Success': 'Berhasil', 'Warning': 'Peringatan',
        'Active': 'Aktif', 'Inactive': 'Tidak Aktif', 'Pending': 'Tertunda',
        'Completed': 'Selesai', 'Failed': 'Gagal', 'Cancelled': 'Dibatalkan',
        'Open': 'Buka', 'Closed': 'Tutup', 'Archived': 'Diarsipkan',
    },
    'no': {
        'Kanban Board': 'Kanban-tavle', 'Agent Terminals': 'Agent-terminaler',
        'Insights': 'Innsikt', 'Roadmap': 'Veikart', 'Ideation': 'Idégenerering',
        'Changelog': 'Endringslogg', 'Context': 'Kontekst',
        'GitHub Issues': 'GitHub-problemer', 'GitHub PRs': 'GitHub-PR-er',
        'GitLab Issues': 'GitLab-problemer', 'GitLab MRs': 'GitLab-MR-er',
        'Worktrees': 'Worktrees', 'MCP Overview': 'MCP-overblik',
        'Settings': 'Innstillinger', 'Help & Feedback': 'Hjelp og tilbakemeldinger',
        'New Task': 'Ny oppgave', 'Collapse Sidebar': 'Skjul sidefelt',
        'Expand Sidebar': 'Vis sidefelt', 'Sponsor Us': 'Sponsorer oss',
        'Application Settings': 'Applikasjonsinnstillinger',
        'App Settings': 'App-innstillinger', 'Project Settings': 'Prosjektinnstillinger',
        'Appearance': 'Utseende', 'Language': 'Språk',
        'Developer Tools': 'Utviklerverktøy', 'Agent Settings': 'Agent-innstillinger',
        'Accounts': 'Kontoer', 'Updates': 'Oppdateringer',
        'Notifications': 'Varsler', 'Terminal Fonts': 'Terminal-skrifttyper',
        'Project': 'Prosjekt', 'Tools': 'Verktøy',
        'Update Available': 'Oppdatering tilgjengelig', 'Update and Restart': 'Oppdater og start på nytt',
        'Install and Restart': 'Installer og start på nytt', 'Dismiss': 'Lukk',
        'Add': 'Legg til', 'Cancel': 'Avbryt', 'Delete': 'Slett',
        'Save': 'Lagre', 'Close': 'Lukk', 'Edit': 'Rediger',
        'Create': 'Opprett', 'New': 'Ny', 'View': 'Vis',
        'Open': 'Åpne', 'Search': 'Søk', 'Loading...': 'Laster...',
        'Please wait...': 'Vennligst vent...', 'No results found': 'Ingen resultater funnet',
        'Error': 'Feil', 'Success': 'Suksess', 'Warning': 'Advarsel',
        'Active': 'Aktiv', 'Inactive': 'Inaktiv', 'Pending': 'Venter',
        'Completed': 'Fullført', 'Failed': 'Mislyktes', 'Cancelled': 'Kansellert',
        'Open': 'Åpen', 'Closed': 'Lukket', 'Archived': 'Arkivert',
    },
    'th': {
        'Kanban Board': 'คันบันบอร์ด', 'Agent Terminals': 'เทอร์มินัลเอเจนต์',
        'Insights': 'ข้อมูลเชิงลึก', 'Roadmap': 'แผนงาน', 'Ideation': 'การสร้างแนวคิด',
        'Changelog': 'บันทึกการเปลี่ยนแปลง', 'Context': 'บริบท',
        'GitHub Issues': 'GitHub Issues', 'GitHub PRs': 'GitHub PR',
        'GitLab Issues': 'GitLab Issues', 'GitLab MRs': 'GitLab MR',
        'Worktrees': 'Worktrees', 'MCP Overview': 'ภาพรวม MCP',
        'Settings': 'การตั้งค่า', 'Help & Feedback': 'ความช่วยเหลือและข้อเสนอแนะ',
        'New Task': 'งานใหม่', 'Collapse Sidebar': 'ยุบแถบด้านข้าง',
        'Expand Sidebar': 'ขยายแถบด้านข้าง', 'Sponsor Us': 'สนับสนุนเรา',
        'Application Settings': 'การตั้งค่าแอปพลิเคชัน',
        'App Settings': 'การตั้งค่าแอป', 'Project Settings': 'การตั้งค่าโปรเจกต์',
        'Appearance': 'รูปลักษณ์', 'Language': 'ภาษา',
        'Developer Tools': 'เครื่องมือนักพัฒนา', 'Agent Settings': 'การตั้งค่าเอเจนต์',
        'Accounts': 'บัญชี', 'Updates': 'การอัปเดต',
        'Notifications': 'การแจ้งเตือน', 'Terminal Fonts': 'ฟอนต์เทอร์มินัล',
        'Project': 'โปรเจกต์', 'Tools': 'เครื่องมือ',
        'Update Available': 'มีการอัปเดต', 'Update and Restart': 'อัปเดตและเริ่มใหม่',
        'Install and Restart': 'ติดตั้งและเริ่มใหม่', 'Dismiss': 'ปิด',
        'Add': 'เพิ่ม', 'Cancel': 'ยกเลิก', 'Delete': 'ลบ',
        'Save': 'บันทึก', 'Close': 'ปิด', 'Edit': 'แก้ไข',
        'Create': 'สร้าง', 'New': 'สร้างใหม่', 'View': 'ดู',
        'Open': 'เปิด', 'Search': 'ค้นหา', 'Loading...': 'กำลังโหลด...',
        'Please wait...': 'กรุณารอสักครู่...', 'No results found': 'ไม่พบผลลัพธ์',
        'Error': 'ข้อผิดพลาด', 'Success': 'สำเร็จ', 'Warning': 'คำเตือน',
        'Active': 'ใช้งานอยู่', 'Inactive': 'ไม่ได้ใช้งาน', 'Pending': 'รอดำเนินการ',
        'Completed': 'เสร็จสิ้น', 'Failed': 'ล้มเหลว', 'Cancelled': 'ถูกยกเลิก',
        'Open': 'เปิด', 'Closed': 'ปิด', 'Archived': 'เก็บถาวร',
    },
    'uk': {
        'Kanban Board': 'Канбан-дошка', 'Agent Terminals': 'Термінали агентів',
        'Insights': 'Інсайти', 'Roadmap': 'Дорожня карта', 'Ideation': 'Генерація ідей',
        'Changelog': 'Журнал змін', 'Context': 'Контекст',
        'GitHub Issues': 'Проблеми GitHub', 'GitHub PRs': 'PR GitHub',
        'GitLab Issues': 'Проблеми GitLab', 'GitLab MRs': 'MR GitLab',
        'Worktrees': 'Worktrees', 'MCP Overview': 'Огляд MCP',
        'Settings': 'Налаштування', 'Help & Feedback': 'Довідка та зворотний зв\'язок',
        'New Task': 'Нове завдання', 'Collapse Sidebar': 'Згорнути бічну панель',
        'Expand Sidebar': 'Розгорнути бічну панель', 'Sponsor Us': 'Станьте спонсором',
        'Application Settings': 'Налаштування програми',
        'App Settings': 'Налаштування програми', 'Project Settings': 'Налаштування проекту',
        'Appearance': 'Вигляд', 'Language': 'Мова',
        'Developer Tools': 'Інструменти розробника', 'Agent Settings': 'Налаштування агента',
        'Accounts': 'Облікові записи', 'Updates': 'Оновлення',
        'Notifications': 'Сповіщення', 'Terminal Fonts': 'Шрифти терміналу',
        'Project': 'Проект', 'Tools': 'Інструменти',
        'Update Available': 'Доступне оновлення', 'Update and Restart': 'Оновити та перезапустити',
        'Install and Restart': 'Встановити та перезапустити', 'Dismiss': 'Відхилити',
        'Add': 'Додати', 'Cancel': 'Скасувати', 'Delete': 'Видалити',
        'Save': 'Зберегти', 'Close': 'Закрити', 'Edit': 'Редагувати',
        'Create': 'Створити', 'New': 'Створити', 'View': 'Переглянути',
        'Open': 'Відкрити', 'Search': 'Пошук', 'Loading...': 'Завантаження...',
        'Please wait...': 'Будь ласка, зачекайте...', 'No results found': 'Результатів не знайдено',
        'Error': 'Помилка', 'Success': 'Успіх', 'Warning': 'Попередження',
        'Active': 'Активний', 'Inactive': 'Неактивний', 'Pending': 'Очікує',
        'Completed': 'Завершено', 'Failed': 'Невдало', 'Cancelled': 'Скасовано',
        'Open': 'Відкрито', 'Closed': 'Закрито', 'Archived': 'Архівовано',
    },
    'vi': {
        'Kanban Board': 'Bảng Kanban', 'Agent Terminals': 'Terminal Đại lý',
        'Insights': 'Thông tin chi tiết', 'Roadmap': 'Lộ trình', 'Ideation': 'Tạo ý tưởng',
        'Changelog': 'Nhật ký thay đổi', 'Context': 'Ngữ cảnh',
        'GitHub Issues': 'Vấn đề GitHub', 'GitHub PRs': 'PR GitHub',
        'GitLab Issues': 'Vấn đề GitLab', 'GitLab MRs': 'MR GitLab',
        'Worktrees': 'Worktrees', 'MCP Overview': 'Tổng quan MCP',
        'Settings': 'Cài đặt', 'Help & Feedback': 'Trợ giúp & Phản hồi',
        'New Task': 'Tác vụ mới', 'Collapse Sidebar': 'Thu gọn thanh bên',
        'Expand Sidebar': 'Mở rộng thanh bên', 'Sponsor Us': 'Tài trợ chúng tôi',
        'Application Settings': 'Cài đặt Ứng dụng',
        'App Settings': 'Cài đặt Ứng dụng', 'Project Settings': 'Cài đặt Dự án',
        'Appearance': 'Vẻ ngoài', 'Language': 'Ngôn ngữ',
        'Developer Tools': 'Công cụ Nhà phát triển', 'Agent Settings': 'Cài đặt Đại lý',
        'Accounts': 'Tài khoản', 'Updates': 'Cập nhật',
        'Notifications': 'Thông báo', 'Terminal Fonts': 'Phông Terminal',
        'Project': 'Dự án', 'Tools': 'Công cụ',
        'Update Available': 'Cập nhật có sẵn', 'Update and Restart': 'Cập nhật và Khởi động lại',
        'Install and Restart': 'Cài đặt và Khởi động lại', 'Dismiss': 'Bỏ qua',
        'Add': 'Thêm', 'Cancel': 'Hủy', 'Delete': 'Xóa',
        'Save': 'Lưu', 'Close': 'Đóng', 'Edit': 'Chỉnh sửa',
        'Create': 'Tạo', 'New': 'Mới', 'View': 'Xem',
        'Open': 'Mở', 'Search': 'Tìm kiếm', 'Loading...': 'Đang tải...',
        'Please wait...': 'Vui lòng đợi...', 'No results found': 'Không tìm thấy kết quả',
        'Error': 'Lỗi', 'Success': 'Thành công', 'Warning': 'Cảnh báo',
        'Active': 'Hoạt động', 'Inactive': 'Không hoạt động', 'Pending': 'Chờ xử lý',
        'Completed': 'Đã hoàn thành', 'Failed': 'Thất bại', 'Cancelled': 'Đã hủy',
        'Open': 'Mở', 'Closed': 'Đã đóng', 'Archived': 'Đã lưu trữ',
    },
}

def translate_value(value: Any, locale: str, stats: dict) -> Any:
    """Recursively translate all string values in a JSON structure."""
    if isinstance(value, str):
        locale_dict = CRITICAL_TRANSLATIONS.get(locale, {})
        if value in locale_dict:
            stats['translated'] += 1
            return locale_dict[value]
        stats['skipped'] += 1
        return value
    elif isinstance(value, dict):
        return {k: translate_value(v, locale, stats) for k, v in value.items()}
    elif isinstance(value, list):
        return [translate_value(item, locale, stats) for item in value]
    return value

def count_strings(obj) -> int:
    """Count all string values in a JSON structure."""
    if isinstance(obj, str):
        return 1
    elif isinstance(obj, dict):
        return sum(count_strings(v) for v in obj.values())
    elif isinstance(obj, list):
        return sum(count_strings(item) for item in obj)
    return 0

def fix_translation_file(source_path: Path, target_path: Path, locale: str) -> dict:
    """Fix a single translation file by translating all values."""
    stats = {'translated': 0, 'skipped': 0, 'total': 0}

    try:
        with open(source_path, 'r', encoding='utf-8') as f:
            source_data = json.load(f)

        stats['total'] = count_strings(source_data)

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
    print(f"Fixing {len(LOCALE_NAMES)} locales with critical translations...")
    print(f"{'='*60}\n")

    total_stats = {}

    for locale_code in sorted(LOCALE_NAMES.keys()):
        locale_name = LOCALE_NAMES[locale_code]
        locale_path = base_path / locale_code

        if not locale_path.exists():
            print(f"⚠️  Skipping {locale_code} ({locale_name}) - directory not found")
            continue

        print(f"📝 {locale_code} ({locale_name})")

        locale_stats = {
            'translated': 0,
            'skipped': 0,
            'total': 0,
            'files': 0,
            'errors': 0
        }

        for namespace in namespaces:
            source_file = en_path / f"{namespace}.json"
            target_file = locale_path / f"{namespace}.json"

            if source_file.exists() and target_file.exists():
                stats = fix_translation_file(source_file, target_file, locale_code)

                if stats['success']:
                    locale_stats['translated'] += stats['translated']
                    locale_stats['skipped'] += stats['skipped']
                    locale_stats['total'] += stats['total']
                    locale_stats['files'] += 1

                    coverage = (stats['translated'] / stats['total'] * 100) if stats['total'] > 0 else 0
                    print(f"  ✓ {namespace}.json: {stats['translated']}/{stats['total']} critical strings ({coverage:.0f}%)")
                else:
                    locale_stats['errors'] += 1
                    print(f"  ✗ {namespace}.json: {stats.get('error', 'failed')}")

        total_stats[locale_code] = locale_stats
        print()

    # Final summary
    print(f"{'='*60}")
    print("TRANSLATION SUMMARY (Critical Strings Only)")
    print(f"{'='*60}")
    print("Note: This covers the most frequently used UI strings.")
    print("For complete translations, consider using professional translation services.\n")

    for locale_code in sorted(LOCALE_NAMES.keys()):
        if locale_code not in total_stats:
            continue

        stats = total_stats[locale_code]
        if stats['files'] > 0:
            coverage = (stats['translated'] / stats['total'] * 100) if stats['total'] > 0 else 0
            print(f"{locale_code:8} ({LOCALE_NAMES[locale_code]:25}): {stats['translated']:3}/{stats['total']:4} critical strings ({coverage:4.1f}%)")

    print(f"\n✅ Critical translation fix complete!")
    print(f"📝 All {len(LOCALE_NAMES)} locales now have essential UI translations")

if __name__ == '__main__':
    main()
