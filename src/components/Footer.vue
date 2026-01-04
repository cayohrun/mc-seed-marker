<script setup lang="ts">
</script>

<template>
    <div class="footer">
        <p class="copyright">© 2026 cayoh.run</p>
        <p class="license">Based on <a href="https://github.com/jacobsjo/mc-datapack-map" target="_blank">mc-datapack-map</a> by jacobsjo (MIT)</p>
    </div>
</template>

<style scoped>
    .footer {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    p {
        color: rgb(140, 140, 140);
        margin: 0;
        padding: 0;
    }

    .copyright {
        font-size: 11px;
    }

    .license {
        font-size: 9px;
    }

    a {
        color: rgb(140, 140, 140);
        text-decoration: underline;
    }

    a:hover {
        color: rgb(180, 180, 180);
    }
</style>