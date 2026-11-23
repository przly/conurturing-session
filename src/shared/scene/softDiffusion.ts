export const softDiffusionShader = {
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;

    float grainNoise(vec2 point) {
      vec3 hash = fract(vec3(point.xyx) * 0.1031);
      hash += dot(hash, hash.yzx + 33.33);
      return fract((hash.x + hash.y) * hash.z);
    }

    void main() {
      vec3 original = texture2D(tDiffuse, vUv).rgb;
      vec2 radius = 3.5 * fwidth(vUv);
      vec3 diffusion = (
        texture2D(tDiffuse, vUv + vec2( radius.x,  radius.y)).rgb +
        texture2D(tDiffuse, vUv + vec2(-radius.x,  radius.y)).rgb +
        texture2D(tDiffuse, vUv + vec2( radius.x, -radius.y)).rgb +
        texture2D(tDiffuse, vUv + vec2(-radius.x, -radius.y)).rgb
      ) * 0.25;
      vec3 softColor = mix(original, diffusion, 0.32);
      vec3 highlightGlow = max(diffusion - vec3(0.55), vec3(0.0));
      vec3 color = softColor + 0.12 * highlightGlow;
      vec2 pixel = floor(gl_FragCoord.xy);
      float grain = (grainNoise(pixel) + grainNoise(pixel + vec2(19.0, 47.0))) * 0.5 - 0.5;
      grain = mix(grain, grainNoise(floor(pixel * 0.65) + vec2(53.0, 11.0)) - 0.5, 0.2);
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float grainStrength = 0.09 * smoothstep(0.01, 0.18, luminance) * mix(1.0, 0.4, smoothstep(0.65, 1.0, luminance));
      gl_FragColor = vec4(max(color + grain * grainStrength, vec3(0.0)), 1.0);
    }
  `,
}
