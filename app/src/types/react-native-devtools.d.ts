// Not part of react-native's public typings, but the only thing that knows the Metro URL in a bare
// (bridgeless) development build — see src/lib/devHost.native.ts.
declare module 'react-native/Libraries/Core/Devtools/getDevServer' {
  export default function getDevServer(): { url: string; fullBundleUrl?: string; bundleLoadedFromServer: boolean };
}
