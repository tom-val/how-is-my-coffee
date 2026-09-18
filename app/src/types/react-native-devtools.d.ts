/**
 * React Native ships this module without types. `src/lib/devHost.native.ts` uses it to learn which
 * host Metro is serving from, which is how the API URL follows the dev machine's LAN IP.
 */
declare module 'react-native/Libraries/Core/Devtools/getDevServer' {
  /** The live Metro dev-server URL, plus whether the bundle really came from it. */
  export default function getDevServer(): {
    url: string;
    fullBundleUrl?: string;
    bundleLoadedFromServer: boolean;
  };
}
