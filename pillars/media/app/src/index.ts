/**
 * @pops/app-media — Media app package
 *
 * Exports route definitions and navigation config for the shell
 * to lazily load media pages under /media/*.
 */
export { navConfig, routes } from './routes';
export { manifest } from './manifest';
export { PlexConnectPanel } from './components/plex-connect/PlexConnectPanel';
export { RotationTuningPanel } from './components/rotation-tuning/RotationTuningPanel';

// Side-effect: register search result components
import './components/search/register';
