// GLSL shader sources for the prism scene: beams, sheets, glass.
// Kept as plain strings so the consumer wires them into ShaderMaterial.

export const BEAM_VERT = `
      attribute vec3 aTangent;
      attribute float aSide;
      attribute float aT;
      uniform float uWidth;
      varying float vT; varying float vSide;
      void main(){
        vT = aT; vSide = aSide;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 tv = (modelViewMatrix * vec4(position + aTangent, 1.0)).xyz - mv.xyz;
        vec3 toCam = normalize(-mv.xyz);
        vec3 sideDir = cross(normalize(tv), toCam);
        float L = length(sideDir);
        sideDir = (L > 0.0001) ? sideDir / L : vec3(0.0, 1.0, 0.0);
        mv.xyz += sideDir * aSide * uWidth;
        gl_Position = projectionMatrix * mv;
      }`;

export const BEAM_FRAG = `
      uniform vec3 uColor;
      uniform float uOpacity; uniform float uTime; uniform float uReveal;
      uniform float uTailFade; uniform float uSeed;
      varying float vT; varying float vSide;
      void main(){
        float s = vSide;
        float core = exp(-s * s * 20.0);
        float halo = exp(-s * s * 4.5) * 0.5;
        float prof = core + halo;
        float tail = mix(1.0, 0.16 + 0.84 * pow(1.0 - vT, 1.5), uTailFade);
        float rev = clamp((uReveal - vT) / 0.12, 0.0, 1.0);
        float shimmer = 0.9 + 0.1 * sin(vT * 30.0 - uTime * 4.5 + uSeed * 17.0);
        float a = prof * tail * rev * shimmer * uOpacity;
        gl_FragColor = vec4(uColor * (0.72 + 0.85 * core), a);
      }`;

export const SHEET_VERT = `
      attribute float aW;      // spectral coordinate across the fan
      attribute float aT;      // parameter along the path
      attribute float aAlpha;  // per-column validity (eases out on TIR)
      attribute float aRev;    // per-column propagation front
      attribute vec3  aColor;  // spectral RGB
      varying float vW; varying float vT; varying float vA; varying float vRev;
      varying vec3 vCol;
      void main(){
        vW = aW; vT = aT; vA = aAlpha; vRev = aRev; vCol = aColor;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`;

export const SHEET_FRAG = `
      uniform float uTime; uniform float uOpacity;
      uniform float uHeadWhite; uniform float uHeadK;
      uniform float uAlongBase; uniform float uAlongK;
      varying float vW; varying float vT; varying float vA; varying float vRev;
      varying vec3 vCol;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        float edge  = smoothstep(0.0, 0.05, vW) * smoothstep(1.0, 0.95, vW);
        float along = uAlongBase + (1.0 - uAlongBase) * exp(-vT * uAlongK);
        along *= 1.0 - smoothstep(0.90, 1.0, vT);
        float rev = clamp((vRev - vT) / 0.10, 0.0, 1.0);
        float grain = 0.88 + 0.24 * hash(vec2(vT * 211.0 + vW * 97.0, floor(uTime * 24.0)));
        vec3 col = mix(vCol, vec3(1.0), uHeadWhite * exp(-vT * uHeadK));
        gl_FragColor = vec4(col, edge * along * rev * vA * grain * uOpacity);
      }`;

export const GLASS_VERT = `
        varying vec3 vN; varying vec3 vW;
        void main(){
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`;

export const GLASS_FRAG = `
        uniform vec3 uCam; uniform sampler2D uTex; uniform float uTime;
        uniform vec4 uPlane; uniform float uPlaneZ;
        varying vec3 vN; varying vec3 vW;

        // A dark-room gradient the glass can reflect and refract, so every
        // face carries a soft vertical sheen even off the word plane.
        vec3 room(vec3 d){
          float h = clamp(d.y * 0.6 + 0.5, 0.0, 1.0);
          return mix(vec3(0.010, 0.012, 0.020), vec3(0.075, 0.095, 0.150), h);
        }

        void main(){
          vec3 N = normalize(vN);
          vec3 V = normalize(vW - uCam);
          float ndv  = abs(dot(N, -V));
          float fres = pow(1.0 - ndv, 2.6);
          vec3 col = vec3(0.016, 0.020, 0.034);

          // Bend the view ray into the glass and sample the backdrop word
          // where it lands, with a slight RGB split — chromatic aberration.
          vec3 Rr = refract(V, N, 1.0 / 1.45);
          col += room(Rr) * 0.55;
          if (Rr.z < -0.001){
            float tt = (uPlaneZ - vW.z) / Rr.z;
            vec2 hit = vW.xy + Rr.xy * tt;
            vec2 uv = vec2((hit.x - uPlane.x) / (2.0 * uPlane.z) + 0.5,
                           (hit.y - uPlane.y) / (2.0 * uPlane.w) + 0.5);
            if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0){
              vec2 ca = Rr.xy * 0.05;
              float tr = texture2D(uTex, uv + ca).r;
              float tg = texture2D(uTex, uv).g;
              float tb = texture2D(uTex, uv - ca).b;
              col += vec3(tr, tg, tb) * 0.5;
            }
          }

          // Mirror sheen at grazing angles + a tight bright lip on the rim.
          col += room(reflect(V, N)) * fres * 1.7;
          col += vec3(0.60, 0.66, 0.80) * pow(1.0 - ndv, 6.0) * 0.38;

          float sheen = 0.5 + 0.5 * sin(vW.x * 1.7 + vW.y * 2.3 + uTime * 0.6);
          col += vec3(0.020, 0.025, 0.035) * sheen;
          col += vec3(0.50, 0.56, 0.68) * fres * 0.35;
          gl_FragColor = vec4(col, 0.74 + fres * 0.20);
        }`;
