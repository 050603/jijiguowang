import { isBoolean, isFunction, isObject, isString } from 'lodash';
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

  setTempSeconds: (val) => set({ tempSeconds: isFunction(val) ? val(useSettingsStore.getState().tempSeconds) : val }),
  setContainerWidth: (val) =>
    set({ containerWidth: isFunction(val) ? val(useSettingsStore.getState().containerWidth) : val }),
  setShowMarketIndexPc: (val) =>
    set({ showMarketIndexPc: isFunction(val) ? val(useSettingsStore.getState().showMarketIndexPc) : val }),
  setShowMarketIndexMobile: (val) =>
    set({
      showMarketIndexMobile: isFunction(val) ? val(useSettingsStore.getState().showMarketIndexMobile) : val
    }),
  setShowGroupFundSearchPc: (val) =>
    set({
      showGroupFundSearchPc: isFunction(val) ? val(useSettingsStore.getState().showGroupFundSearchPc) : val
    }),
  setShowGroupFundSearchMobile: (val) =>
    set({
      showGroupFundSearchMobile: isFunction(val) ? val(useSettingsStore.getState().showGroupFundSearchMobile) : val
    }),
  setDynamicStylePc: (val) =>
    set({ dynamicStylePc: isFunction(val) ? val(useSettingsStore.getState().dynamicStylePc) : val }),
  setDynamicStyleMobile: (val) =>
    set({ dynamicStyleMobile: isFunction(val) ? val(useSettingsStore.getState().dynamicStyleMobile) : val }),
  setIsGroupSummarySticky: (val) => {
    const nextVal = isFunction(val) ? val(useSettingsStore.getState().isGroupSummarySticky) : val;
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
    if (!customSettings || !isObject(customSettings)) return;
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
      if (isBoolean(customSettings.showMarketIndexPc)) patch.showMarketIndexPc = customSettings.showMarketIndexPc;
      if (isBoolean(customSettings.showMarketIndexMobile))
        patch.showMarketIndexMobile = customSettings.showMarketIndexMobile;
      if (isBoolean(customSettings.showGroupFundSearchPc))
        patch.showGroupFundSearchPc = customSettings.showGroupFundSearchPc;
      if (isBoolean(customSettings.showGroupFundSearchMobile))
        patch.showGroupFundSearchMobile = customSettings.showGroupFundSearchMobile;
      if (isBoolean(customSettings.dynamicStylePc)) patch.dynamicStylePc = customSettings.dynamicStylePc;
      if (isBoolean(customSettings.dynamicStyleMobile)) patch.dynamicStyleMobile = customSettings.dynamicStyleMobile;
      if (isBoolean(customSettings.isGroupSummarySticky))
        patch.isGroupSummarySticky = customSettings.isGroupSummarySticky;
      if (isString(customSettings.theme) && (customSettings.theme === 'dark' || customSettings.theme === 'light')) {
        patch.theme = customSettings.theme;
        // 直接应用到 DOM 和 localStorage，确保多端同步后主题立即生效
        try {
          document.documentElement.setAttribute('data-theme', customSettings.theme);
          localStorage.setItem('theme', customSettings.theme);
        } catch {}
      }
      if (
        isString(customSettings.viewMode) &&
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
