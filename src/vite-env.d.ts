/// <reference types="vite/client" />
/// <reference types="vite-userscript-plugin/virtual" />
/// <reference types="vite-userscript-plugin/types/tampermonkey" />

declare module 'virtual:presenter-hub' {
  export const presenterUrl: string
  export const socketUrl: string
}
