import DefaultTheme from 'vitepress/theme'
import { useRoute } from 'vitepress'
import { defineComponent, Fragment, h, onMounted, watch } from 'vue'
import LanguageSwitcher from './components/LanguageSwitcher.vue'
import { maybeRedirectByBrowserLocale } from './locale'
import './style.css'

export default {
  ...DefaultTheme,
  Layout: defineComponent({
    name: 'SamuelWikiTheme',
    setup() {
      const route = useRoute()

      onMounted(() => {
        maybeRedirectByBrowserLocale(route.path)
      })

      watch(
        () => route.path,
        (path) => {
          maybeRedirectByBrowserLocale(path)
        }
      )

      return () => h(Fragment, [h(DefaultTheme.Layout), h(LanguageSwitcher)])
    }
  })
}
