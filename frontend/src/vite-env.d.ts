/// <reference types="vite/client" />
/// <reference types="@2gis/mapgl/global" />

interface ImportMetaEnv {
  readonly VITE_2GIS_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
