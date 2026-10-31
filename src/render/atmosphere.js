// Air that has height. three's built-in exponential fog is uniform; real halls are not — mist pools near the floor and
// thins with altitude, so distance reads as depth and tall spaces read as tall. This patches the shared fog chunks once.
// The curve is gentle (it never removes fog entirely, and never more than ~1.6x it), so every chapter's own fog colour
// and density still decide its character.
import * as THREE from 'three';

let patched = false;
export function installHeightFog() {
  if (patched) return; patched = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = C.fog_pars_vertex.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogY;');
  C.fog_vertex = C.fog_vertex.replace('vFogDepth = - mvPosition.z;', 'vFogDepth = - mvPosition.z;\n\tvFogY = (inverse(viewMatrix) * mvPosition).y;');
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogY;');
  C.fog_fragment = C.fog_fragment.replace('float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
    'float hz = 0.55 + 1.05 * exp(-max(vFogY, 0.0) * 0.1);          // thick at the floor, thinning with height\n\t\tfloat fd = fogDensity * hz;\n\t\tfloat fogFactor = 1.0 - exp( - fd * fd * vFogDepth * vFogDepth );');
}
