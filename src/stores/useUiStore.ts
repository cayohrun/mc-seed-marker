import { defineStore } from "pinia";
import { ref } from "vue";

export const useUiStore = defineStore('ui', () => {
    const modrinthMenuOpen = ref(false)
    const sidebarOpen = ref(true)

    function syncSidebarWithScreen() {
        if (typeof window !== 'undefined') {
            sidebarOpen.value = !window.matchMedia('(max-width: 767px)').matches
        }
    }

    return { modrinthMenuOpen, sidebarOpen, syncSidebarWithScreen }
})
