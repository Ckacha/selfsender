<script>
  import { onMount } from 'svelte';

  const DEPTH = 0.28;
  const SEGMENTS = 64;
  const FRONT = [1, 0.83, 0.23];
  const SIDE = [0.78, 0.6, 0];
  const CAMERA_DISTANCE = 6;
  const REST_PITCH = 0.17;
  const DRAG_SPEED = 0.01;
  const MAX_PITCH = 1.3;

  const VERTEX_SHADER = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec3 aColor;
    uniform mat3 uRotation;
    uniform mat4 uProjection;
    varying vec3 vNormal;
    varying vec3 vColor;
    void main() {
      vec3 p = uRotation * aPosition;
      vNormal = uRotation * aNormal;
      vColor = aColor;
      gl_Position = uProjection * vec4(p.x, p.y, p.z - ${CAMERA_DISTANCE.toFixed(1)}, 1.0);
    }
  `;

  const FRAGMENT_SHADER = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vColor;
    void main() {
      float light = max(dot(normalize(vNormal), normalize(vec3(0.35, 0.5, 0.8))), 0.0);
      gl_FragColor = vec4(vColor * (0.55 + 0.55 * light), 1.0);
    }
  `;

  let canvas;
  let shadow;
  let dragging = $state(false);
  let failed = $state(false);

  function buildMesh() {
    const positions = [];
    const normals = [];
    const colors = [];

    function triangle(a, b, c, normal, color) {
      for (const p of [a, b, c]) {
        positions.push(...p);
        normals.push(...normal);
        colors.push(...color);
      }
    }

    function caps(a, b, c) {
      for (const z of [DEPTH, -DEPTH]) {
        triangle([...a, z], [...b, z], [...c, z], [0, 0, Math.sign(z)], FRONT);
      }
    }

    function walls(contour, side) {
      contour.forEach((p, i) => {
        const q = contour[(i + 1) % contour.length];
        const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        const normal = [(side * -(q[1] - p[1])) / length, (side * (q[0] - p[0])) / length, 0];
        triangle([...p, DEPTH], [...q, DEPTH], [...q, -DEPTH], normal, SIDE);
        triangle([...p, DEPTH], [...q, -DEPTH], [...p, -DEPTH], normal, SIDE);
      });
    }

    function dot(cx, cy, radius) {
      const contour = Array.from({ length: SEGMENTS }, (_, i) => {
        const angle = (-i / SEGMENTS) * Math.PI * 2;
        return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
      });
      contour.forEach((p, i) => caps([cx, cy], p, contour[(i + 1) % contour.length]));
      walls(contour, 1);
    }

    function letterD(left, arcX, radius, stroke) {
      const outline = (x, r) => [
        [x, -r],
        [x, r],
        ...Array.from({ length: SEGMENTS + 1 }, (_, i) => {
          const angle = Math.PI / 2 - (Math.PI * i) / SEGMENTS;
          return [arcX + Math.cos(angle) * r, Math.sin(angle) * r];
        }),
      ];
      const outer = outline(left, radius);
      const inner = outline(left + stroke, radius - stroke);
      outer.forEach((p, i) => {
        const next = (i + 1) % outer.length;
        caps(p, outer[next], inner[next]);
        caps(p, inner[next], inner[i]);
      });
      walls(outer, 1);
      walls(inner, -1);
    }

    dot(-1.02, 0.5, 0.27);
    dot(-1.02, -0.5, 0.27);
    letterD(-0.22, 0.28, 1, 0.32);

    return { positions, normals, colors, count: positions.length / 3 };
  }

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  function projection(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  }

  function rotation(yaw, pitch) {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cx = Math.cos(pitch);
    const sx = Math.sin(pitch);
    return [cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy];
  }

  onMount(() => {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (!gl) {
      failed = true;
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spinSpeed = reducedMotion ? 0 : (Math.PI * 2) / 5;
    let yaw = reducedMotion ? -0.45 : 0;
    let pitch = REST_PITCH;
    let yawSpeed = spinSpeed;
    let lastX = 0;
    let lastY = 0;
    let lastTime = performance.now();
    let frame;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    gl.viewport(0, 0, canvas.width, canvas.height);

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    gl.useProgram(program);

    const mesh = buildMesh();
    for (const [name, data] of [['aPosition', mesh.positions], ['aNormal', mesh.normals], ['aColor', mesh.colors]]) {
      const location = gl.getAttribLocation(program, name);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
    }

    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uProjection'), false, projection(0.56, canvas.width / canvas.height, 0.1, 50));
    const rotationLocation = gl.getUniformLocation(program, 'uRotation');
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    function draw(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (!dragging) {
        yaw += yawSpeed * dt;
        yawSpeed += (spinSpeed - yawSpeed) * Math.min(1, dt * 2);
        pitch += (REST_PITCH - pitch) * Math.min(1, dt * 1.5);
      }

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix3fv(rotationLocation, false, rotation(yaw, pitch));
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      shadow.style.transform = `scaleX(${0.35 + 0.65 * Math.abs(Math.cos(yaw))})`;
      frame = requestAnimationFrame(draw);
    }

    function down(e) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      yawSpeed = 0;
      canvas.setPointerCapture(e.pointerId);
    }

    function move(e) {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      yaw += dx * DRAG_SPEED;
      pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch + dy * DRAG_SPEED));
      yawSpeed = Math.max(-12, Math.min(12, dx * DRAG_SPEED * 60));
    }

    function up() {
      dragging = false;
    }

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  });
</script>

<div class="scene">
  {#if failed}
    <span class="fallback" aria-hidden="true">:D</span>
  {:else}
    <canvas bind:this={canvas} class:dragging aria-label="A spinning 3D :D. Drag to turn it." title="Drag to turn"></canvas>
  {/if}
  <div class="shadow" bind:this={shadow}></div>
</div>

<style>
  .scene { position: relative; height: 240px; display: grid; place-items: center; }
  canvas { width: 320px; max-width: 100%; height: 230px; cursor: grab; touch-action: none; user-select: none; }
  canvas.dragging { cursor: grabbing; }
  .fallback { font-size: 150px; font-weight: 900; line-height: 1; letter-spacing: -6px; color: #ffd43b; }
  .shadow { position: absolute; bottom: 2px; width: 150px; height: 16px; border-radius: 50%; background: rgba(0, 0, 0, 0.18);
    filter: blur(6px); pointer-events: none; }
</style>
