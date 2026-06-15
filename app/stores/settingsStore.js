import { create } from 'zustand';
import { useStorageStore } from './storageStore';

/**
 * 本地配置状态 Zustand Store
 */
export const useSettingsStore = create((set) => ({
  tempSeconds: 60,
  containerWidth: 1200,
  showMarketIndexPc: true,
  showMarketIndexMobile: true,
  showGroupFundSearchPc: true,
  showGroupFundSearchMobile: true,
  dynamicStylePc: true,
  dynamicStyleMobile: true,
  isGroupSummarySticky: false,

  setTempSeconds: (val) =>
    set({ tempSeconds: typeof val === 'function' ? val(useSettingsStore.getState().tempSeconds) : val }),
  setContainerWidth: (val) =>
    set({ containerWidth: typeof val === 'function' ? val(useSettingsStore.getState().containerWidth) : val }),
  setShowMarketIndexPc: (val) =>
    set({ showMarketIndexPc: typeof val === 'function' ? val(useSettingsStore.getState().showMarketIndexPc) : val }),
  setShowMarketIndexMobile: (val) =>
    set({
      showMarketIndexMobile: typeof val === 'function' ? val(useSettingsStore.getState().showMarketIndexMobile) : val
    }),
  setShowGroupFundSearchPc: (val) =>
    set({
      showGroupFundSearchPc: typeof val === 'function' ? val(useSettingsStore.getState().showGroupFundSearchPc) : val
    }),
  setShowGroupFundSearchMobile: (val) =>
    set({
      showGroupFundSearchMobile:
        typeof val === 'function' ? val(useSettingsStore.getState().showGroupFundSearchMobile) : val
    }),
  setDynamicStylePc: (val) =>
    set({ dynamicStylePc: typeof val === 'function' ? val(useSettingsStore.getState().dynamicStylePc) : val }),
  setDynamicStyleMobile: (val) =>
    set({ dynamicStyleMobile: typeof val === 'function' ? val(useSettingsStore.getState().dynamicStyleMobile) : val }),
  setIsGroupSummarySticky: (val) => {
    const nextVal = typeof val === 'function' ? val(useSettingsStore.getState().isGroupSummarySticky) : val;
    set({ isGroupSummarySticky: nextVal });
    // 同步到 customSettings 以实现多端云同步
    try {
      const { setCustomSettings, customSettings } = useStorageStore.getState();
      setCustomSettings({ ...(customSettings || {}), isGroupSummarySticky: nextVal });
    } catch {}
  },

  /**
   * 从 customSettings 解析并同步配置到 Zustand 状态
   */
  syncFromCustomSettings: (customSettings) => {
    if (!customSettings || typeof customSettings !== 'object') return;
    try {
      const patch = {};
      const w = customSettings.pcContainerWidth;
      const num = Number(w);
      if (Number.isFinite(num)) {
        const maxWidth =
          typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
            ? 99999
            : typeof window !== 'undefined'
              ? window.innerWidth
              : 1200;
        patch.containerWidth = Math.min(maxWidth, Math.max(600, num));
      }
      if (typeof customSettings.showMarketIndexPc === 'boolean')
        patch.showMarketIndexPc = customSettings.showMarketIndexPc;
      if (typeof customSettings.showMarketIndexMobile === 'boolean')
        patch.showMarketIndexMobile = customSettings.showMarketIndexMobile;
      if (typeof customSettings.showGroupFundSearchPc === 'boolean')
        patch.showGroupFundSearchPc = customSettings.showGroupFundSearchPc;
      if (typeof customSettings.showGroupFundSearchMobile === 'boolean')
        patch.showGroupFundSearchMobile = customSettings.showGroupFundSearchMobile;
      if (typeof customSettings.dynamicStylePc === 'boolean') patch.dynamicStylePc = customSettings.dynamicStylePc;
      if (typeof customSettings.dynamicStyleMobile === 'boolean')
        patch.dynamicStyleMobile = customSettings.dynamicStyleMobile;
      if (typeof customSettings.isGroupSummarySticky === 'boolean')
        patch.isGroupSummarySticky = customSettings.isGroupSummarySticky;
      if (
        typeof customSettings.theme === 'string' &&
        (customSettings.theme === 'dark' || customSettings.theme === 'light')
      ) {
        patch.theme = customSettings.theme;
        // 直接应用到 DOM 和 localStorage，确保多端同步后主题立即生效
        try {
          document.documentElement.setAttribute('data-theme', customSettings.theme);
          localStorage.setItem('theme', customSettings.theme);
        } catch {}
      }
      if (
        typeof customSettings.viewMode === 'string' &&
        (customSettings.viewMode === 'card' || customSettings.viewMode === 'list')
      )
        patch.viewMode = customSettings.viewMode;

      if (Object.keys(patch).length > 0) {
        set(patch);
      }
    } catch (e) {
      // ignore
    }
  }
}));
