<script setup lang="ts">
// Header - 純展示用，不需要 sidebar toggle 邏輯
</script>

<template>
    <header class="flex items-center justify-between border-b-2 border-border-dark bg-surface-dark px-6 py-3 h-16 z-20 shrink-0">
        <div class="flex items-center gap-8">
            <!-- Logo -->
            <div class="flex items-center gap-3 text-white">
                <div class="size-10 bg-primary border-2 border-white/20 flex items-center justify-center shadow-pixel-sm">
                    <span class="material-symbols-outlined !text-[24px]">grass</span>
                </div>
                <h1 class="text-2xl font-pixel tracking-wide text-white drop-shadow-md">MC Seed Map</h1>
            </div>

            <!-- Navigation - 固定顯示 -->
            <nav class="flex items-center gap-6">
                <a class="text-white text-sm font-bold uppercase tracking-widest hover:text-primary transition-colors font-pixel text-lg" href="#">Map</a>
                <a class="text-text-secondary text-sm font-bold uppercase tracking-widest hover:text-white transition-colors font-pixel text-lg" href="#">Seeds</a>
                <a class="text-text-secondary text-sm font-bold uppercase tracking-widest hover:text-white transition-colors font-pixel text-lg" href="#">Apps</a>
            </nav>
        </div>

        <div class="flex items-center gap-4">
            <!-- Online Status -->
            <div class="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/10">
                <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span class="text-lg text-text-secondary font-pixel pt-1">Online</span>
            </div>

            <!-- Login Button -->
            <button class="mc-button h-10 px-6 flex items-center justify-center text-lg font-pixel transition-none">
                LOG IN
            </button>
        </div>
    </header>
</template>
