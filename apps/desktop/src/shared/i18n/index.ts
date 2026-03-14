import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import English translation resources
import enCommon from './locales/en/common.json';
import enNavigation from './locales/en/navigation.json';
import enSettings from './locales/en/settings.json';
import enTasks from './locales/en/tasks.json';
import enWelcome from './locales/en/welcome.json';
import enOnboarding from './locales/en/onboarding.json';
import enDialogs from './locales/en/dialogs.json';
import enGitlab from './locales/en/gitlab.json';
import enTaskReview from './locales/en/taskReview.json';
import enTerminal from './locales/en/terminal.json';
import enErrors from './locales/en/errors.json';

// Import French translation resources
import frCommon from './locales/fr/common.json';
import frNavigation from './locales/fr/navigation.json';
import frSettings from './locales/fr/settings.json';
import frTasks from './locales/fr/tasks.json';
import frWelcome from './locales/fr/welcome.json';
import frOnboarding from './locales/fr/onboarding.json';
import frDialogs from './locales/fr/dialogs.json';
import frGitlab from './locales/fr/gitlab.json';
import frTaskReview from './locales/fr/taskReview.json';
import frTerminal from './locales/fr/terminal.json';
import frErrors from './locales/fr/errors.json';

// Import Spanish translation resources
import esCommon from './locales/es/common.json';
import esNavigation from './locales/es/navigation.json';
import esSettings from './locales/es/settings.json';
import esTasks from './locales/es/tasks.json';
import esWelcome from './locales/es/welcome.json';
import esOnboarding from './locales/es/onboarding.json';
import esDialogs from './locales/es/dialogs.json';
import esGitlab from './locales/es/gitlab.json';
import esTaskReview from './locales/es/taskReview.json';
import esTerminal from './locales/es/terminal.json';
import esErrors from './locales/es/errors.json';

// Import German translation resources
import deCommon from './locales/de/common.json';
import deNavigation from './locales/de/navigation.json';
import deSettings from './locales/de/settings.json';
import deTasks from './locales/de/tasks.json';
import deWelcome from './locales/de/welcome.json';
import deOnboarding from './locales/de/onboarding.json';
import deDialogs from './locales/de/dialogs.json';
import deGitlab from './locales/de/gitlab.json';
import deTaskReview from './locales/de/taskReview.json';
import deTerminal from './locales/de/terminal.json';
import deErrors from './locales/de/errors.json';

// Import Japanese translation resources
import jaCommon from './locales/ja/common.json';
import jaNavigation from './locales/ja/navigation.json';
import jaSettings from './locales/ja/settings.json';
import jaTasks from './locales/ja/tasks.json';
import jaWelcome from './locales/ja/welcome.json';
import jaOnboarding from './locales/ja/onboarding.json';
import jaDialogs from './locales/ja/dialogs.json';
import jaGitlab from './locales/ja/gitlab.json';
import jaTaskReview from './locales/ja/taskReview.json';
import jaTerminal from './locales/ja/terminal.json';
import jaErrors from './locales/ja/errors.json';

// Import Chinese (Simplified) translation resources
import zhCNCommon from './locales/zh-CN/common.json';
import zhCNNavigation from './locales/zh-CN/navigation.json';
import zhCNSettings from './locales/zh-CN/settings.json';
import zhCNTasks from './locales/zh-CN/tasks.json';
import zhCNWelcome from './locales/zh-CN/welcome.json';
import zhCNOnboarding from './locales/zh-CN/onboarding.json';
import zhCNDialogs from './locales/zh-CN/dialogs.json';
import zhCNGitlab from './locales/zh-CN/gitlab.json';
import zhCNTaskReview from './locales/zh-CN/taskReview.json';
import zhCNTerminal from './locales/zh-CN/terminal.json';
import zhCNErrors from './locales/zh-CN/errors.json';

// Import Chinese (Traditional) translation resources
import zhTWCommon from './locales/zh-TW/common.json';
import zhTWNavigation from './locales/zh-TW/navigation.json';
import zhTWSettings from './locales/zh-TW/settings.json';
import zhTWTasks from './locales/zh-TW/tasks.json';
import zhTWWelcome from './locales/zh-TW/welcome.json';
import zhTWOnboarding from './locales/zh-TW/onboarding.json';
import zhTWDialogs from './locales/zh-TW/dialogs.json';
import zhTWGitlab from './locales/zh-TW/gitlab.json';
import zhTWTaskReview from './locales/zh-TW/taskReview.json';
import zhTWTerminal from './locales/zh-TW/terminal.json';
import zhTWErrors from './locales/zh-TW/errors.json';

// Import Hindi translation resources
import hiCommon from './locales/hi/common.json';
import hiNavigation from './locales/hi/navigation.json';
import hiSettings from './locales/hi/settings.json';
import hiTasks from './locales/hi/tasks.json';
import hiWelcome from './locales/hi/welcome.json';
import hiOnboarding from './locales/hi/onboarding.json';
import hiDialogs from './locales/hi/dialogs.json';
import hiGitlab from './locales/hi/gitlab.json';
import hiTaskReview from './locales/hi/taskReview.json';
import hiTerminal from './locales/hi/terminal.json';
import hiErrors from './locales/hi/errors.json';

// Import Portuguese (Brazil) translation resources
import ptBRCommon from './locales/pt-BR/common.json';
import ptBRNavigation from './locales/pt-BR/navigation.json';
import ptBRSettings from './locales/pt-BR/settings.json';
import ptBRTasks from './locales/pt-BR/tasks.json';
import ptBRWelcome from './locales/pt-BR/welcome.json';
import ptBROnboarding from './locales/pt-BR/onboarding.json';
import ptBRDialogs from './locales/pt-BR/dialogs.json';
import ptBRGitlab from './locales/pt-BR/gitlab.json';
import ptBRTaskReview from './locales/pt-BR/taskReview.json';
import ptBRTerminal from './locales/pt-BR/terminal.json';
import ptBRErrors from './locales/pt-BR/errors.json';

// Import Portuguese (Portugal) translation resources
import ptPTCommon from './locales/pt-PT/common.json';
import ptPTNavigation from './locales/pt-PT/navigation.json';
import ptPTSettings from './locales/pt-PT/settings.json';
import ptPTTasks from './locales/pt-PT/tasks.json';
import ptPTWelcome from './locales/pt-PT/welcome.json';
import ptPTOnboarding from './locales/pt-PT/onboarding.json';
import ptPTDialogs from './locales/pt-PT/dialogs.json';
import ptPTGitlab from './locales/pt-PT/gitlab.json';
import ptPTTaskReview from './locales/pt-PT/taskReview.json';
import ptPTTerminal from './locales/pt-PT/terminal.json';
import ptPTErrors from './locales/pt-PT/errors.json';

// Import Russian translation resources
import ruCommon from './locales/ru/common.json';
import ruNavigation from './locales/ru/navigation.json';
import ruSettings from './locales/ru/settings.json';
import ruTasks from './locales/ru/tasks.json';
import ruWelcome from './locales/ru/welcome.json';
import ruOnboarding from './locales/ru/onboarding.json';
import ruDialogs from './locales/ru/dialogs.json';
import ruGitlab from './locales/ru/gitlab.json';
import ruTaskReview from './locales/ru/taskReview.json';
import ruTerminal from './locales/ru/terminal.json';
import ruErrors from './locales/ru/errors.json';

// Import Korean translation resources
import koCommon from './locales/ko/common.json';
import koNavigation from './locales/ko/navigation.json';
import koSettings from './locales/ko/settings.json';
import koTasks from './locales/ko/tasks.json';
import koWelcome from './locales/ko/welcome.json';
import koOnboarding from './locales/ko/onboarding.json';
import koDialogs from './locales/ko/dialogs.json';
import koGitlab from './locales/ko/gitlab.json';
import koTaskReview from './locales/ko/taskReview.json';
import koTerminal from './locales/ko/terminal.json';
import koErrors from './locales/ko/errors.json';

// Import Turkish translation resources
import trCommon from './locales/tr/common.json';
import trNavigation from './locales/tr/navigation.json';
import trSettings from './locales/tr/settings.json';
import trTasks from './locales/tr/tasks.json';
import trWelcome from './locales/tr/welcome.json';
import trOnboarding from './locales/tr/onboarding.json';
import trDialogs from './locales/tr/dialogs.json';
import trGitlab from './locales/tr/gitlab.json';
import trTaskReview from './locales/tr/taskReview.json';
import trTerminal from './locales/tr/terminal.json';
import trErrors from './locales/tr/errors.json';

// Import Italian translation resources
import itCommon from './locales/it/common.json';
import itNavigation from './locales/it/navigation.json';
import itSettings from './locales/it/settings.json';
import itTasks from './locales/it/tasks.json';
import itWelcome from './locales/it/welcome.json';
import itOnboarding from './locales/it/onboarding.json';
import itDialogs from './locales/it/dialogs.json';
import itGitlab from './locales/it/gitlab.json';
import itTaskReview from './locales/it/taskReview.json';
import itTerminal from './locales/it/terminal.json';
import itErrors from './locales/it/errors.json';

// Import Vietnamese translation resources
import viCommon from './locales/vi/common.json';
import viNavigation from './locales/vi/navigation.json';
import viSettings from './locales/vi/settings.json';
import viTasks from './locales/vi/tasks.json';
import viWelcome from './locales/vi/welcome.json';
import viOnboarding from './locales/vi/onboarding.json';
import viDialogs from './locales/vi/dialogs.json';
import viGitlab from './locales/vi/gitlab.json';
import viTaskReview from './locales/vi/taskReview.json';
import viTerminal from './locales/vi/terminal.json';
import viErrors from './locales/vi/errors.json';

// Import Thai translation resources
import thCommon from './locales/th/common.json';
import thNavigation from './locales/th/navigation.json';
import thSettings from './locales/th/settings.json';
import thTasks from './locales/th/tasks.json';
import thWelcome from './locales/th/welcome.json';
import thOnboarding from './locales/th/onboarding.json';
import thDialogs from './locales/th/dialogs.json';
import thGitlab from './locales/th/gitlab.json';
import thTaskReview from './locales/th/taskReview.json';
import thTerminal from './locales/th/terminal.json';
import thErrors from './locales/th/errors.json';

// Import Dutch translation resources
import nlCommon from './locales/nl/common.json';
import nlNavigation from './locales/nl/navigation.json';
import nlSettings from './locales/nl/settings.json';
import nlTasks from './locales/nl/tasks.json';
import nlWelcome from './locales/nl/welcome.json';
import nlOnboarding from './locales/nl/onboarding.json';
import nlDialogs from './locales/nl/dialogs.json';
import nlGitlab from './locales/nl/gitlab.json';
import nlTaskReview from './locales/nl/taskReview.json';
import nlTerminal from './locales/nl/terminal.json';
import nlErrors from './locales/nl/errors.json';

// Import Polish translation resources
import plCommon from './locales/pl/common.json';
import plNavigation from './locales/pl/navigation.json';
import plSettings from './locales/pl/settings.json';
import plTasks from './locales/pl/tasks.json';
import plWelcome from './locales/pl/welcome.json';
import plOnboarding from './locales/pl/onboarding.json';
import plDialogs from './locales/pl/dialogs.json';
import plGitlab from './locales/pl/gitlab.json';
import plTaskReview from './locales/pl/taskReview.json';
import plTerminal from './locales/pl/terminal.json';
import plErrors from './locales/pl/errors.json';

// Import Norwegian translation resources
import noCommon from './locales/no/common.json';
import noNavigation from './locales/no/navigation.json';
import noSettings from './locales/no/settings.json';
import noTasks from './locales/no/tasks.json';
import noWelcome from './locales/no/welcome.json';
import noOnboarding from './locales/no/onboarding.json';
import noDialogs from './locales/no/dialogs.json';
import noGitlab from './locales/no/gitlab.json';
import noTaskReview from './locales/no/taskReview.json';
import noTerminal from './locales/no/terminal.json';
import noErrors from './locales/no/errors.json';

// Import Indonesian translation resources
import idCommon from './locales/id/common.json';
import idNavigation from './locales/id/navigation.json';
import idSettings from './locales/id/settings.json';
import idTasks from './locales/id/tasks.json';
import idWelcome from './locales/id/welcome.json';
import idOnboarding from './locales/id/onboarding.json';
import idDialogs from './locales/id/dialogs.json';
import idGitlab from './locales/id/gitlab.json';
import idTaskReview from './locales/id/taskReview.json';
import idTerminal from './locales/id/terminal.json';
import idErrors from './locales/id/errors.json';

// Import Ukrainian translation resources
import ukCommon from './locales/uk/common.json';
import ukNavigation from './locales/uk/navigation.json';
import ukSettings from './locales/uk/settings.json';
import ukTasks from './locales/uk/tasks.json';
import ukWelcome from './locales/uk/welcome.json';
import ukOnboarding from './locales/uk/onboarding.json';
import ukDialogs from './locales/uk/dialogs.json';
import ukGitlab from './locales/uk/gitlab.json';
import ukTaskReview from './locales/uk/taskReview.json';
import ukTerminal from './locales/uk/terminal.json';
import ukErrors from './locales/uk/errors.json';

export const defaultNS = 'common';

export const resources = {
  en: {
    common: enCommon,
    navigation: enNavigation,
    settings: enSettings,
    tasks: enTasks,
    welcome: enWelcome,
    onboarding: enOnboarding,
    dialogs: enDialogs,
    gitlab: enGitlab,
    taskReview: enTaskReview,
    terminal: enTerminal,
    errors: enErrors
  },
  fr: {
    common: frCommon,
    navigation: frNavigation,
    settings: frSettings,
    tasks: frTasks,
    welcome: frWelcome,
    onboarding: frOnboarding,
    dialogs: frDialogs,
    gitlab: frGitlab,
    taskReview: frTaskReview,
    terminal: frTerminal,
    errors: frErrors
  },
  es: {
    common: esCommon,
    navigation: esNavigation,
    settings: esSettings,
    tasks: esTasks,
    welcome: esWelcome,
    onboarding: esOnboarding,
    dialogs: esDialogs,
    gitlab: esGitlab,
    taskReview: esTaskReview,
    terminal: esTerminal,
    errors: esErrors
  },
  de: {
    common: deCommon,
    navigation: deNavigation,
    settings: deSettings,
    tasks: deTasks,
    welcome: deWelcome,
    onboarding: deOnboarding,
    dialogs: deDialogs,
    gitlab: deGitlab,
    taskReview: deTaskReview,
    terminal: deTerminal,
    errors: deErrors
  },
  ja: {
    common: jaCommon,
    navigation: jaNavigation,
    settings: jaSettings,
    tasks: jaTasks,
    welcome: jaWelcome,
    onboarding: jaOnboarding,
    dialogs: jaDialogs,
    gitlab: jaGitlab,
    taskReview: jaTaskReview,
    terminal: jaTerminal,
    errors: jaErrors
  },
  'zh-CN': {
    common: zhCNCommon,
    navigation: zhCNNavigation,
    settings: zhCNSettings,
    tasks: zhCNTasks,
    welcome: zhCNWelcome,
    onboarding: zhCNOnboarding,
    dialogs: zhCNDialogs,
    gitlab: zhCNGitlab,
    taskReview: zhCNTaskReview,
    terminal: zhCNTerminal,
    errors: zhCNErrors
  },
  'zh-TW': {
    common: zhTWCommon,
    navigation: zhTWNavigation,
    settings: zhTWSettings,
    tasks: zhTWTasks,
    welcome: zhTWWelcome,
    onboarding: zhTWOnboarding,
    dialogs: zhTWDialogs,
    gitlab: zhTWGitlab,
    taskReview: zhTWTaskReview,
    terminal: zhTWTerminal,
    errors: zhTWErrors
  },
  hi: {
    common: hiCommon,
    navigation: hiNavigation,
    settings: hiSettings,
    tasks: hiTasks,
    welcome: hiWelcome,
    onboarding: hiOnboarding,
    dialogs: hiDialogs,
    gitlab: hiGitlab,
    taskReview: hiTaskReview,
    terminal: hiTerminal,
    errors: hiErrors
  },
  'pt-BR': {
    common: ptBRCommon,
    navigation: ptBRNavigation,
    settings: ptBRSettings,
    tasks: ptBRTasks,
    welcome: ptBRWelcome,
    onboarding: ptBROnboarding,
    dialogs: ptBRDialogs,
    gitlab: ptBRGitlab,
    taskReview: ptBRTaskReview,
    terminal: ptBRTerminal,
    errors: ptBRErrors
  },
  'pt-PT': {
    common: ptPTCommon,
    navigation: ptPTNavigation,
    settings: ptPTSettings,
    tasks: ptPTTasks,
    welcome: ptPTWelcome,
    onboarding: ptPTOnboarding,
    dialogs: ptPTDialogs,
    gitlab: ptPTGitlab,
    taskReview: ptPTTaskReview,
    terminal: ptPTTerminal,
    errors: ptPTErrors
  },
  ru: {
    common: ruCommon,
    navigation: ruNavigation,
    settings: ruSettings,
    tasks: ruTasks,
    welcome: ruWelcome,
    onboarding: ruOnboarding,
    dialogs: ruDialogs,
    gitlab: ruGitlab,
    taskReview: ruTaskReview,
    terminal: ruTerminal,
    errors: ruErrors
  },
  ko: {
    common: koCommon,
    navigation: koNavigation,
    settings: koSettings,
    tasks: koTasks,
    welcome: koWelcome,
    onboarding: koOnboarding,
    dialogs: koDialogs,
    gitlab: koGitlab,
    taskReview: koTaskReview,
    terminal: koTerminal,
    errors: koErrors
  },
  tr: {
    common: trCommon,
    navigation: trNavigation,
    settings: trSettings,
    tasks: trTasks,
    welcome: trWelcome,
    onboarding: trOnboarding,
    dialogs: trDialogs,
    gitlab: trGitlab,
    taskReview: trTaskReview,
    terminal: trTerminal,
    errors: trErrors
  },
  it: {
    common: itCommon,
    navigation: itNavigation,
    settings: itSettings,
    tasks: itTasks,
    welcome: itWelcome,
    onboarding: itOnboarding,
    dialogs: itDialogs,
    gitlab: itGitlab,
    taskReview: itTaskReview,
    terminal: itTerminal,
    errors: itErrors
  },
  vi: {
    common: viCommon,
    navigation: viNavigation,
    settings: viSettings,
    tasks: viTasks,
    welcome: viWelcome,
    onboarding: viOnboarding,
    dialogs: viDialogs,
    gitlab: viGitlab,
    taskReview: viTaskReview,
    terminal: viTerminal,
    errors: viErrors
  },
  th: {
    common: thCommon,
    navigation: thNavigation,
    settings: thSettings,
    tasks: thTasks,
    welcome: thWelcome,
    onboarding: thOnboarding,
    dialogs: thDialogs,
    gitlab: thGitlab,
    taskReview: thTaskReview,
    terminal: thTerminal,
    errors: thErrors
  },
  nl: {
    common: nlCommon,
    navigation: nlNavigation,
    settings: nlSettings,
    tasks: nlTasks,
    welcome: nlWelcome,
    onboarding: nlOnboarding,
    dialogs: nlDialogs,
    gitlab: nlGitlab,
    taskReview: nlTaskReview,
    terminal: nlTerminal,
    errors: nlErrors
  },
  pl: {
    common: plCommon,
    navigation: plNavigation,
    settings: plSettings,
    tasks: plTasks,
    welcome: plWelcome,
    onboarding: plOnboarding,
    dialogs: plDialogs,
    gitlab: plGitlab,
    taskReview: plTaskReview,
    terminal: plTerminal,
    errors: plErrors
  },
  no: {
    common: noCommon,
    navigation: noNavigation,
    settings: noSettings,
    tasks: noTasks,
    welcome: noWelcome,
    onboarding: noOnboarding,
    dialogs: noDialogs,
    gitlab: noGitlab,
    taskReview: noTaskReview,
    terminal: noTerminal,
    errors: noErrors
  },
  id: {
    common: idCommon,
    navigation: idNavigation,
    settings: idSettings,
    tasks: idTasks,
    welcome: idWelcome,
    onboarding: idOnboarding,
    dialogs: idDialogs,
    gitlab: idGitlab,
    taskReview: idTaskReview,
    terminal: idTerminal,
    errors: idErrors
  },
  uk: {
    common: ukCommon,
    navigation: ukNavigation,
    settings: ukSettings,
    tasks: ukTasks,
    welcome: ukWelcome,
    onboarding: ukOnboarding,
    dialogs: ukDialogs,
    gitlab: ukGitlab,
    taskReview: ukTaskReview,
    terminal: ukTerminal,
    errors: ukErrors
  }
} as const;

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // Default language (will be overridden by settings)
    fallbackLng: 'en',
    defaultNS,
    ns: ['common', 'navigation', 'settings', 'tasks', 'welcome', 'onboarding', 'dialogs', 'gitlab', 'taskReview', 'terminal', 'errors'],
    interpolation: {
      escapeValue: false // React already escapes values
    },
    react: {
      useSuspense: false // Disable suspense for Electron compatibility
    }
  });

export default i18n;
