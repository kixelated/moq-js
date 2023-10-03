/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly PUBLIC_RELAY_HOST: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
