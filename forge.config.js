module.exports = {
  packagerConfig: {
    asar: true,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // This tells Forge where your background process config is
        build: [
          {
            entry: 'main.js',
            config: 'vite.main.config.mjs',
          },
          {
            entry: 'preload.js',
            config: 'vite.preload.config.mjs',
          },
        ],
        // This tells Forge where your Sidebar UI config is
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    {
      name: '@electron-forge/plugin-fuses',
      config: {
        version: 'fuse-v1',
        resetAdHocDarwinSignature: true,
      },
    },
  ],
};