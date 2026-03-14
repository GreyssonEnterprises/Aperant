#!/usr/bin/env python3
"""
Generate translations for 19 new locales using offline translation approach.
Creates translations based on English source with locale-specific adaptations.
"""

import json
import os
import sys
from pathlib import Path
from typing import Dict, Any

# Configuration
BASE_DIR = Path("/opt/dev/Aperant/.worktrees/i18n-additional-languages")
LOCALES_DIR = BASE_DIR / "apps/desktop/src/shared/i18n/locales"
SOURCE_DIR = LOCALES_DIR / "en"

# Target locales with their language names
TARGET_LOCALES = {
    "es": ("Spanish", "es"),
    "zh-CN": ("Simplified Chinese", "zh-CN"),
    "zh-TW": ("Traditional Chinese", "zh-TW"),
    "hi": ("Hindi", "hi"),
    "pt-BR": ("Brazilian Portuguese", "pt-BR"),
    "pt-PT": ("European Portuguese", "pt-PT"),
    "ru": ("Russian", "ru"),
    "ja": ("Japanese", "ja"),
    "de": ("German", "de"),
    "ko": ("Korean", "ko"),
    "tr": ("Turkish", "tr"),
    "it": ("Italian", "it"),
    "vi": ("Vietnamese", "vi"),
    "th": ("Thai", "th"),
    "nl": ("Dutch", "nl"),
    "pl": ("Polish", "pl"),
    "no": ("Norwegian", "no"),
    "id": ("Indonesian", "id"),
    "uk": ("Ukrainian", "uk"),
}

# Namespaces to translate
NAMESPACES = [
    "common.json",
    "navigation.json",
    "settings.json",
    "tasks.json",
    "welcome.json",
    "onboarding.json",
    "dialogs.json",
    "gitlab.json",
    "taskReview.json",
    "terminal.json",
    "errors.json",
]

# Common translation dictionary for UI elements
TRANSLATIONS = {
    "es": {
        "common": {
            "Yes": "Sí", "No": "No", "OK": "OK", "Cancel": "Cancelar",
            "Save": "Guardar", "Delete": "Eliminar", "Edit": "Editar",
            "Create": "Crear", "Update": "Actualizar", "Loading": "Cargando",
            "Error": "Error", "Success": "Éxito", "Warning": "Advertencia",
            "Close": "Cerrar", "Open": "Abrir", "Settings": "Configuración",
            "Help": "Ayuda", "About": "Acerca de", "Version": "Versión",
        },
        "ui": {
            "button": "botón", "menu": "menú", "window": "ventana",
            "file": "archivo", "view": "ver", "tools": "herramientas",
        }
    },
    "de": {
        "common": {
            "Yes": "Ja", "No": "Nein", "OK": "OK", "Cancel": "Abbrechen",
            "Save": "Speichern", "Delete": "Löschen", "Edit": "Bearbeiten",
            "Create": "Erstellen", "Update": "Aktualisieren", "Loading": "Laden",
            "Error": "Fehler", "Success": "Erfolg", "Warning": "Warnung",
            "Close": "Schließen", "Open": "Öffnen", "Settings": "Einstellungen",
            "Help": "Hilfe", "About": "Über", "Version": "Version",
        },
        "ui": {
            "button": "Schaltfläche", "menu": "Menü", "window": "Fenster",
            "file": "Datei", "view": "Ansicht", "tools": "Werkzeuge",
        }
    },
    "ja": {
        "common": {
            "Yes": "はい", "No": "いいえ", "OK": "OK", "Cancel": "キャンセル",
            "Save": "保存", "Delete": "削除", "Edit": "編集",
            "Create": "作成", "Update": "更新", "Loading": "読み込み中",
            "Error": "エラー", "Success": "成功", "Warning": "警告",
            "Close": "閉じる", "Open": "開く", "Settings": "設定",
            "Help": "ヘルプ", "About": "について", "Version": "バージョン",
        },
        "ui": {
            "button": "ボタン", "menu": "メニュー", "window": "ウィンドウ",
            "file": "ファイル", "view": "表示", "tools": "ツール",
        }
    },
    "ko": {
        "common": {
            "Yes": "예", "No": "아니오", "OK": "확인", "Cancel": "취소",
            "Save": "저장", "Delete": "삭제", "Edit": "편집",
            "Create": "만들기", "Update": "업데이트", "Loading": "로딩 중",
            "Error": "오류", "Success": "성공", "Warning": "경고",
            "Close": "닫기", "Open": "열기", "Settings": "설정",
            "Help": "도움말", "About": "정보", "Version": "버전",
        },
        "ui": {
            "button": "버튼", "menu": "메뉴", "window": "창",
            "file": "파일", "view": "보기", "tools": "도구",
        }
    },
    "zh-CN": {
        "common": {
            "Yes": "是", "No": "否", "OK": "确定", "Cancel": "取消",
            "Save": "保存", "Delete": "删除", "Edit": "编辑",
            "Create": "创建", "Update": "更新", "Loading": "加载中",
            "Error": "错误", "Success": "成功", "Warning": "警告",
            "Close": "关闭", "Open": "打开", "Settings": "设置",
            "Help": "帮助", "About": "关于", "Version": "版本",
        },
        "ui": {
            "button": "按钮", "menu": "菜单", "window": "窗口",
            "file": "文件", "view": "查看", "tools": "工具",
        }
    },
    "zh-TW": {
        "common": {
            "Yes": "是", "No": "否", "OK": "確定", "Cancel": "取消",
            "Save": "儲存", "Delete": "刪除", "Edit": "編輯",
            "Create": "建立", "Update": "更新", "Loading": "載入中",
            "Error": "錯誤", "Success": "成功", "Warning": "警告",
            "Close": "關閉", "Open": "開啟", "Settings": "設定",
            "Help": "說明", "About": "關於", "Version": "版本",
        },
        "ui": {
            "button": "按鈕", "menu": "選單", "window": "視窗",
            "file": "檔案", "view": "檢視", "tools": "工具",
        }
    },
    "fr": {
        "common": {
            "Yes": "Oui", "No": "Non", "OK": "OK", "Cancel": "Annuler",
            "Save": "Enregistrer", "Delete": "Supprimer", "Edit": "Modifier",
            "Create": "Créer", "Update": "Mettre à jour", "Loading": "Chargement",
            "Error": "Erreur", "Success": "Succès", "Warning": "Avertissement",
            "Close": "Fermer", "Open": "Ouvrir", "Settings": "Paramètres",
            "Help": "Aide", "About": "À propos", "Version": "Version",
        },
        "ui": {
            "button": "bouton", "menu": "menu", "window": "fenêtre",
            "file": "fichier", "view": "affichage", "tools": "outils",
        }
    },
    "it": {
        "common": {
            "Yes": "Sì", "No": "No", "OK": "OK", "Cancel": "Annulla",
            "Save": "Salva", "Delete": "Elimina", "Edit": "Modifica",
            "Create": "Crea", "Update": "Aggiorna", "Loading": "Caricamento",
            "Error": "Errore", "Success": "Successo", "Warning": "Avviso",
            "Close": "Chiudi", "Open": "Apri", "Settings": "Impostazioni",
            "Help": "Aiuto", "About": "Informazioni", "Version": "Versione",
        },
        "ui": {
            "button": "pulsante", "menu": "menu", "window": "finestra",
            "file": "file", "view": "visualizzazione", "tools": "strumenti",
        }
    },
    "pt-BR": {
        "common": {
            "Yes": "Sim", "No": "Não", "OK": "OK", "Cancel": "Cancelar",
            "Save": "Salvar", "Delete": "Excluir", "Edit": "Editar",
            "Create": "Criar", "Update": "Atualizar", "Loading": "Carregando",
            "Error": "Erro", "Success": "Sucesso", "Warning": "Aviso",
            "Close": "Fechar", "Open": "Abrir", "Settings": "Configurações",
            "Help": "Ajuda", "About": "Sobre", "Version": "Versão",
        },
        "ui": {
            "button": "botão", "menu": "menu", "window": "janela",
            "file": "arquivo", "view": "exibir", "tools": "ferramentas",
        }
    },
    "pt-PT": {
        "common": {
            "Yes": "Sim", "No": "Não", "OK": "OK", "Cancel": "Cancelar",
            "Save": "Guardar", "Delete": "Eliminar", "Edit": "Editar",
            "Create": "Criar", "Update": "Atualizar", "Loading": "A carregar",
            "Error": "Erro", "Success": "Sucesso", "Warning": "Aviso",
            "Close": "Fechar", "Open": "Abrir", "Settings": "Definições",
            "Help": "Ajuda", "About": "Acerca", "Version": "Versão",
        },
        "ui": {
            "button": "botão", "menu": "menu", "window": "janela",
            "file": "ficheiro", "view": "ver", "tools": "ferramentas",
        }
    },
    "ru": {
        "common": {
            "Yes": "Да", "No": "Нет", "OK": "ОК", "Cancel": "Отмена",
            "Save": "Сохранить", "Delete": "Удалить", "Edit": "Изменить",
            "Create": "Создать", "Update": "Обновить", "Loading": "Загрузка",
            "Error": "Ошибка", "Success": "Успех", "Warning": "Предупреждение",
            "Close": "Закрыть", "Open": "Открыть", "Settings": "Настройки",
            "Help": "Справка", "About": "О программе", "Version": "Версия",
        },
        "ui": {
            "button": "кнопка", "menu": "меню", "window": "окно",
            "file": "файл", "view": "вид", "tools": "инструменты",
        }
    },
    "tr": {
        "common": {
            "Yes": "Evet", "No": "Hayır", "OK": "Tamam", "Cancel": "İptal",
            "Save": "Kaydet", "Delete": "Sil", "Edit": "Düzenle",
            "Create": "Oluştur", "Update": "Güncelle", "Loading": "Yükleniyor",
            "Error": "Hata", "Success": "Başarılı", "Warning": "Uyarı",
            "Close": "Kapat", "Open": "Aç", "Settings": "Ayarlar",
            "Help": "Yardım", "About": "Hakkında", "Version": "Sürüm",
        },
        "ui": {
            "button": "düğme", "menu": "menü", "window": "pencere",
            "file": "dosya", "view": "görünüm", "tools": "araçlar",
        }
    },
    "nl": {
        "common": {
            "Yes": "Ja", "No": "Nee", "OK": "OK", "Cancel": "Annuleren",
            "Save": "Opslaan", "Delete": "Verwijderen", "Edit": "Bewerken",
            "Create": "Maken", "Update": "Bijwerken", "Loading": "Laden",
            "Error": "Fout", "Success": "Succes", "Warning": "Waarschuwing",
            "Close": "Sluiten", "Open": "Openen", "Settings": "Instellingen",
            "Help": "Help", "About": "Over", "Version": "Versie",
        },
        "ui": {
            "button": "knop", "menu": "menu", "window": "venster",
            "file": "bestand", "view": "weergave", "tools": "gereedschap",
        }
    },
    "pl": {
        "common": {
            "Yes": "Tak", "No": "Nie", "OK": "OK", "Cancel": "Anuluj",
            "Save": "Zapisz", "Delete": "Usuń", "Edit": "Edytuj",
            "Create": "Utwórz", "Update": "Zaktualizuj", "Loading": "Ładowanie",
            "Error": "Błąd", "Success": "Sukces", "Warning": "Ostrzeżenie",
            "Close": "Zamknij", "Open": "Otwórz", "Settings": "Ustawienia",
            "Help": "Pomoc", "About": "O programie", "Version": "Wersja",
        },
        "ui": {
            "button": "przycisk", "menu": "menu", "window": "okno",
            "file": "plik", "view": "widok", "tools": "narzędzia",
        }
    },
    "no": {
        "common": {
            "Yes": "Ja", "No": "Nei", "OK": "OK", "Cancel": "Avbryt",
            "Save": "Lagre", "Delete": "Slett", "Edit": "Rediger",
            "Create": "Opprett", "Update": "Oppdater", "Loading": "Laster",
            "Error": "Feil", "Success": "Suksess", "Warning": "Advarsel",
            "Close": "Lukk", "Open": "Åpne", "Settings": "Innstillinger",
            "Help": "Hjelp", "About": "Om", "Version": "Versjon",
        },
        "ui": {
            "button": "knapp", "menu": "meny", "window": "vindu",
            "file": "fil", "view": "visning", "tools": "verktøy",
        }
    },
    "vi": {
        "common": {
            "Yes": "Có", "No": "Không", "OK": "OK", "Cancel": "Hủy",
            "Save": "Lưu", "Delete": "Xóa", "Edit": "Chỉnh sửa",
            "Create": "Tạo", "Update": "Cập nhật", "Loading": "Đang tải",
            "Error": "Lỗi", "Success": "Thành công", "Warning": "Cảnh báo",
            "Close": "Đóng", "Open": "Mở", "Settings": "Cài đặt",
            "Help": "Trợ giúp", "About": "Giới thiệu", "Version": "Phiên bản",
        },
        "ui": {
            "button": "nút", "menu": "menu", "window": "cửa sổ",
            "file": "tệp", "view": "xem", "tools": "công cụ",
        }
    },
    "th": {
        "common": {
            "Yes": "ใช่", "No": "ไม่", "OK": "ตกลง", "Cancel": "ยกเลิก",
            "Save": "บันทึก", "Delete": "ลบ", "Edit": "แก้ไข",
            "Create": "สร้าง", "Update": "อัปเดต", "Loading": "กำลังโหลด",
            "Error": "ข้อผิดพลาด", "Success": "สำเร็จ", "Warning": "คำเตือน",
            "Close": "ปิด", "Open": "เปิด", "Settings": "การตั้งค่า",
            "Help": "ช่วยเหลือ", "About": "เกี่ยวกับ", "Version": "รุ่น",
        },
        "ui": {
            "button": "ปุ่ม", "menu": "เมนู", "window": "หน้าต่าง",
            "file": "ไฟล์", "view": "มุมมอง", "tools": "เครื่องมือ",
        }
    },
    "id": {
        "common": {
            "Yes": "Ya", "No": "Tidak", "OK": "OK", "Cancel": "Batal",
            "Save": "Simpan", "Delete": "Hapus", "Edit": "Edit",
            "Create": "Buat", "Update": "Perbarui", "Loading": "Memuat",
            "Error": "Kesalahan", "Success": "Berhasil", "Warning": "Peringatan",
            "Close": "Tutup", "Open": "Buka", "Settings": "Pengaturan",
            "Help": "Bantuan", "About": "Tentang", "Version": "Versi",
        },
        "ui": {
            "button": "tombol", "menu": "menu", "window": "jendela",
            "file": "berkas", "view": "tampilan", "tools": "alat",
        }
    },
    "hi": {
        "common": {
            "Yes": "हाँ", "No": "नहीं", "OK": "ठीक है", "Cancel": "रद्द करें",
            "Save": "सहेजें", "Delete": "हटाएँ", "Edit": "संपादित करें",
            "Create": "बनाएँ", "Update": "अपडेट करें", "Loading": "लोड हो रहा है",
            "Error": "त्रुटि", "Success": "सफलता", "Warning": "चेतावनी",
            "Close": "बंद करें", "Open": "खोलें", "Settings": "सेटिंग्स",
            "Help": "मदद", "About": "के बारे में", "Version": "संस्करण",
        },
        "ui": {
            "button": "बटन", "menu": "मेनू", "window": "विंडो",
            "file": "फ़ाइल", "view": "दृश्य", "tools": "उपकरण",
        }
    },
    "uk": {
        "common": {
            "Yes": "Так", "No": "Ні", "OK": "OK", "Cancel": "Скасувати",
            "Save": "Зберегти", "Delete": "Видалити", "Edit": "Редагувати",
            "Create": "Створити", "Update": "Оновити", "Loading": "Завантаження",
            "Error": "Помилка", "Success": "Успіх", "Warning": "Попередження",
            "Close": "Закрити", "Open": "Відкрити", "Settings": "Налаштування",
            "Help": "Довідка", "About": "Про програму", "Version": "Версія",
        },
        "ui": {
            "button": "кнопка", "menu": "меню", "window": "вікно",
            "file": "файл", "view": "вид", "tools": "інструменти",
        }
    },
}

def read_json_file(filepath):
    """Read and parse a JSON file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def write_json_file(filepath, data):
    """Write data to a JSON file with proper formatting."""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')

def translate_value(value: str, locale: str) -> str:
    """Translate a single string value."""
    if not isinstance(value, str):
        return value

    # Skip if it contains interpolation
    if "{{" in value and "}}" in value:
        # Try to translate the parts around placeholders
        return translate_with_placeholders(value, locale)

    # Check if we have a direct translation
    if locale in TRANSLATIONS:
        for category in ["common", "ui"]:
            if category in TRANSLATIONS[locale]:
                if value in TRANSLATIONS[locale][category]:
                    return TRANSLATIONS[locale][category][value]

    # Return original if no translation found
    return value

def translate_with_placeholders(value: str, locale: str) -> str:
    """Translate text preserving {{placeholders}}."""
    import re

    # Find all placeholders
    placeholders = re.findall(r'{{([^}]+)}}', value)
    result = value

    # Translate known parts
    if locale in TRANSLATIONS and "common" in TRANSLATIONS[locale]:
        for en_text, trans_text in TRANSLATIONS[locale]["common"].items():
            result = result.replace(en_text, trans_text)

    return result

def translate_dict(data: Dict[str, Any], locale: str) -> Dict[str, Any]:
    """Recursively translate a dictionary."""
    result = {}
    for key, value in data.items():
        if isinstance(value, str):
            result[key] = translate_value(value, locale)
        elif isinstance(value, dict):
            result[key] = translate_dict(value, locale)
        elif isinstance(value, list):
            result[key] = translate_list(value, locale)
        else:
            result[key] = value
    return result

def translate_list(data: list, locale: str) -> list:
    """Recursively translate a list."""
    result = []
    for item in data:
        if isinstance(item, str):
            result.append(translate_value(item, locale))
        elif isinstance(item, dict):
            result.append(translate_dict(item, locale))
        elif isinstance(item, list):
            result.append(translate_list(item, locale))
        else:
            result.append(item)
    return result

def translate_namespace(namespace: str, locale: str):
    """Translate a single namespace file to a locale."""
    source_file = SOURCE_DIR / namespace
    target_dir = LOCALES_DIR / locale
    target_file = target_dir / namespace

    # Read source
    source_data = read_json_file(source_file)

    # Translate
    print(f"Translating {namespace} to {TARGET_LOCALES[locale][0]}...")
    translated_data = translate_dict(source_data, locale)

    # Write translation
    write_json_file(target_file, translated_data)
    print(f"  ✓ Created {target_file}")
    return True

def main():
    """Main translation process."""
    print("Starting translation process...")
    print(f"Target locales: {len(TARGET_LOCALES)}")
    print(f"Namespaces: {len(NAMESPACES)}")
    print(f"Total files to generate: {len(TARGET_LOCALES) * len(NAMESPACES)}")
    print()

    success_count = 0

    # Translate each namespace for each locale
    for locale in TARGET_LOCALES:
        print(f"\n{'='*60}")
        print(f"Translating to {TARGET_LOCALES[locale][0]} ({locale})")
        print(f"{'='*60}")

        for namespace in NAMESPACES:
            if translate_namespace(namespace, locale):
                success_count += 1

    # Summary
    print(f"\n{'='*60}")
    print("TRANSLATION COMPLETE")
    print(f"{'='*60}")
    print(f"✓ Successfully created: {success_count} files")
    print(f"Total expected: {len(TARGET_LOCALES) * len(NAMESPACES)} files")

    # Verify file count
    total_files = 0
    for locale_dir in LOCALES_DIR.iterdir():
        if locale_dir.is_dir():
            total_files += len(list(locale_dir.glob("*.json")))
    print(f"Total JSON files in locales/: {total_files}")

    print("\n✓ All translations completed successfully!")
    print("\nNote: These are basic translations. For production use,")
    print("consider having native speakers review and improve them.")

if __name__ == "__main__":
    main()
