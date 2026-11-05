import { Suspense, lazy, useEffect, useState } from 'react'
import { initStore, useStore } from './store'
import { clearUrlSettingParams } from './lib/urlSettings'
import { hasProfileImportUrl } from './lib/profileSharing'
import { createDefaultOpenAIProfile, hasDefaultPresetConfig, normalizeSettings } from './lib/apiProfiles'
import { getCustomConnectionConfigUrl, hasEmbeddedDefaultConfig, loadCustomConnectionSettingsFromUrl, loadEmbeddedDefaultConfig } from './lib/customConnectionConfigUrl'
import { getDefaultPresetProfileId, getPresetProfileIds, isPresetConfigOnlyEnabled, setPresetConfig } from './lib/presetConfig'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import { useColorMode } from './hooks/useColorMode'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import InputBar from './components/InputBar'
import ConfirmDialog from './components/ConfirmDialog'
import DataProgressDialog from './components/DataProgressDialog'
import Toast from './components/Toast'
import ImageContextMenu from './components/ImageContextMenu'
import { FavoriteCollectionsView } from './components/favorites/FavoriteCollectionsView'
import { useGlobalClickSuppression } from './lib/clickSuppression'

// 弹窗只在打开时加载，避免把首屏用不到的逻辑打进主包
const DetailModal = lazy(() => import('./components/DetailModal'))
const Lightbox = lazy(() => import('./components/Lightbox'))
const SettingsModal = lazy(() => import('./components/SettingsModal'))
const ProfileImportModal = lazy(() => import('./components/settings/ProfileImportModal'))
const MaskEditorModal = lazy(() => import('./components/MaskEditorModal'))
const SketchBoardModal = lazy(() => import('./components/SketchBoardModal'))
const FavoriteCollectionPickerModal = lazy(() =>
  import('./components/favorites/FavoriteCollectionPickerModal').then((m) => ({ default: m.FavoriteCollectionPickerModal })),
)
const ManageCollectionsModal = lazy(() =>
  import('./components/favorites/ManageCollectionsModal').then((m) => ({ default: m.ManageCollectionsModal })),
)

let defaultConfigImportStarted = false

export default function App() {
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const showSettings = useStore((s) => s.showSettings)
  const detailTaskId = useStore((s) => s.detailTaskId)
  const lightboxImageId = useStore((s) => s.lightboxImageId)
  const maskEditorImageId = useStore((s) => s.maskEditorImageId)
  const sketchBoard = useStore((s) => s.sketchBoard)
  const favoritePickerTaskIds = useStore((s) => s.favoritePickerTaskIds)
  const manageCollectionsOpen = useStore((s) => s.isManageCollectionsModalOpen)
  const [settingsReady, setSettingsReady] = useState(false)
  const [profileImportSource, setProfileImportSource] = useState<string | null>(null)
  useDockerApiUrlMigrationNotice()
  useColorMode()
  useGlobalClickSuppression()

  useEffect(() => {
    if (defaultConfigImportStarted) return
    defaultConfigImportStarted = true

    const customConnectionConfigUrl = getCustomConnectionConfigUrl()
    const embeddedDefaultConfig = hasEmbeddedDefaultConfig()
    const loadDefaultConfig = () => embeddedDefaultConfig
      ? Promise.resolve().then(() => loadEmbeddedDefaultConfig())
      : loadCustomConnectionSettingsFromUrl(customConnectionConfigUrl)

    void initStore()
      .then(async () => {
        const importedSettings = embeddedDefaultConfig || customConnectionConfigUrl
          ? await loadDefaultConfig()
          : hasDefaultPresetConfig()
            ? {
                customConnections: [],
                profiles: [{ ...createDefaultOpenAIProfile(), isDefault: true }],
              }
            : null
        setPresetConfig(importedSettings)

        const state = useStore.getState()
        if (importedSettings) {
          await state.setPresetImportedSettings(importedSettings)
        } else if (state.previousPresetConfig) {
          await state.setPresetImportedSettings({ customConnections: [], profiles: [] })
        }

        const syncedState = useStore.getState()
        if (!importedSettings) {
          useStore.setState({ dismissedPresetProfileIds: [], dismissedPresetConnectionIds: [] })
          if (syncedState.settings.profiles.some((profile) => profile.isDefault)) {
            syncedState.setSettings({
              profiles: syncedState.settings.profiles.map((profile) => profile.isDefault ? { ...profile, isDefault: undefined } : profile),
            })
          }
        }

        const current = useStore.getState()
        const presetIds = getPresetProfileIds()
        const defaultPresetId = getDefaultPresetProfileId()
        const settings = isPresetConfigOnlyEnabled()
          ? normalizeSettings({
              ...current.settings,
              activeProfileId: presetIds.has(current.settings.activeProfileId)
                ? current.settings.activeProfileId
                : defaultPresetId ?? [...presetIds][0],
            })
          : current.settings
        current.setSettings(settings)
      })
      .catch((error) => {
        console.warn('Failed to import preset config:', error)
        setPresetConfig(null)
      })
      .finally(() => setSettingsReady(true))
  }, [])

  useEffect(() => {
    if (!settingsReady) return
    const previewUrlImport = () => {
      const url = new URL(window.location.href)
      if (!hasProfileImportUrl(url)) return
      useStore.getState().setShowSettings(false)
      setProfileImportSource(url.toString())
      clearUrlSettingParams(url.searchParams)
      const hash = new URLSearchParams(url.hash.slice(1))
      if (hash.has('config')) {
        hash.delete('config')
        url.hash = hash.toString()
      }
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    }
    previewUrlImport()
    window.addEventListener('hashchange', previewUrlImport)
    window.addEventListener('popstate', previewUrlImport)
    return () => {
      window.removeEventListener('hashchange', previewUrlImport)
      window.removeEventListener('popstate', previewUrlImport)
    }
  }, [settingsReady])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  return (
    <>
      <Header />
      <main data-home-main data-drag-select-surface className="pb-48">
        <div className="safe-area-x max-w-7xl mx-auto">
          <SearchBar />
          {filterFavorite && !activeFavoriteCollectionId ? <FavoriteCollectionsView /> : <TaskGrid />}
        </div>
      </main>
      <InputBar />
      {detailTaskId !== null && (
        <Suspense fallback={null}>
          <DetailModal />
        </Suspense>
      )}
      {lightboxImageId !== null && (
        <Suspense fallback={null}>
          <Lightbox />
        </Suspense>
      )}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsModal onImportProfile={(source) => setProfileImportSource(source ?? '')} />
        </Suspense>
      )}
      {profileImportSource !== null && (
        <Suspense fallback={null}>
          <ProfileImportModal key={profileImportSource} source={profileImportSource} onClose={() => setProfileImportSource(null)} />
        </Suspense>
      )}
      <DataProgressDialog />
      <ConfirmDialog />
      {favoritePickerTaskIds?.length ? (
        <Suspense fallback={null}>
          <FavoriteCollectionPickerModal />
        </Suspense>
      ) : null}
      {manageCollectionsOpen && (
        <Suspense fallback={null}>
          <ManageCollectionsModal />
        </Suspense>
      )}
      <Toast />
      {maskEditorImageId !== null && (
        <Suspense fallback={null}>
          <MaskEditorModal />
        </Suspense>
      )}
      {sketchBoard !== null && (
        <Suspense fallback={null}>
          <SketchBoardModal />
        </Suspense>
      )}
      <ImageContextMenu />
    </>
  )
}
