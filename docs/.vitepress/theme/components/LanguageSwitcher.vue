<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vitepress'
import {
  getLocaleFromPath,
  getLocalizedPath,
  setStoredLocale,
  type SupportedLocale
} from '../locale'

const route = useRoute()

const currentLocale = computed(() => getLocaleFromPath(route.path))
const switcherLabel = computed(() => (currentLocale.value === 'zh' ? '语言切换' : 'Language'))

const localeOptions: Array<{ code: SupportedLocale; label: string }> = [
  { code: 'en', label: 'EN' },
  { code: 'zh', label: '中文' }
]

function switchLocale(locale: SupportedLocale): void {
  if (typeof window === 'undefined' || locale === currentLocale.value) {
    return
  }

  setStoredLocale(locale)

  const targetPath = getLocalizedPath(route.path, locale)
  const nextUrl = `${targetPath}${window.location.search}${window.location.hash}`

  window.location.assign(nextUrl)
}
</script>

<template>
  <div class="wiki-language-switcher" :aria-label="switcherLabel">
    <span class="wiki-language-switcher__label">{{ switcherLabel }}</span>
    <div class="wiki-language-switcher__actions">
      <button
        v-for="option in localeOptions"
        :key="option.code"
        class="wiki-language-switcher__button"
        :class="{ 'is-active': option.code === currentLocale }"
        :aria-pressed="option.code === currentLocale"
        :disabled="option.code === currentLocale"
        type="button"
        @click="switchLocale(option.code)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
