'use client';

import { useEffect, useId, useRef } from 'react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useI18n } from '@/i18n/provider';
import type { LineageLayout } from './layout';
import { cssVarRgb } from './css-var-rgb';

type Props = {
  layout: LineageLayout;
};

/**
 * Lightweight WebGL2 viewport. One draw call for nodes, one for edges.
 * Camera is keyboard-operable. Colour is paired with the adjacent table.
 */
export function WebGlViewport({ layout }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const { t } = useI18n();
  const labelId = useId();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true });
    if (!gl) return;

    const vertexSrc = `#version 300 es
      in vec3 a_pos;
      in vec3 a_col;
      uniform mat4 u_view;
      out vec3 v_col;
      void main() {
        gl_Position = u_view * vec4(a_pos, 1.0);
        gl_PointSize = 10.0;
        v_col = a_col;
      }`;
    const fragmentSrc = `#version 300 es
      precision mediump float;
      in vec3 v_col;
      out vec4 outColor;
      void main() { outColor = vec4(v_col, 1.0); }`;

    const program = link(gl, vertexSrc, fragmentSrc);
    if (!program) return;
    gl.useProgram(program);

    const posLoc = gl.getAttribLocation(program, 'a_pos');
    const colLoc = gl.getAttribLocation(program, 'a_col');
    const viewLoc = gl.getUniformLocation(program, 'u_view');

    const brand = cssVarRgb('--brand-700', canvas);
    const verifiedRgb = cssVarRgb('--status-verified-solid', canvas);
    const advisoryRgb = cssVarRgb('--status-advisory-solid', canvas);
    const parchment = cssVarRgb('--parchment', canvas);

    const nodeVerts: number[] = [];
    for (const node of layout.nodes) {
      nodeVerts.push(node.position.x, node.position.y, node.position.z, ...brand);
    }
    const edgeVerts: number[] = [];
    for (const edge of layout.edges) {
      const verified = edge.evidenceState === 'verified' || edge.evidenceState === 'accepted';
      const c = verified ? verifiedRgb : advisoryRgb;
      edgeVerts.push(edge.a.x, edge.a.y, edge.a.z, ...c, edge.b.x, edge.b.y, edge.b.z, ...c);
    }

    const nodeBuf = gl.createBuffer();
    const edgeBuf = gl.createBuffer();

    let yaw = 0.6;
    let pitch = 0.35;
    let zoom = 5.2;
    let raf = 0;
    let running = true;

    const onKey = (event: KeyboardEvent) => {
      const step = 0.12;
      if (event.key === 'ArrowLeft') yaw -= step;
      else if (event.key === 'ArrowRight') yaw += step;
      else if (event.key === 'ArrowUp') pitch = Math.min(1.2, pitch + step);
      else if (event.key === 'ArrowDown') pitch = Math.max(-1.2, pitch - step);
      else if (event.key === '+' || event.key === '=') zoom = Math.max(2.4, zoom - 0.3);
      else if (event.key === '-' || event.key === '_') zoom = Math.min(12, zoom + 0.3);
      else if (event.key === '0') {
        yaw = 0.6;
        pitch = 0.35;
        zoom = 5.2;
      } else return;
      event.preventDefault();
    };
    canvas.addEventListener('keydown', onKey);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (time: number) => {
      if (!running) return;
      if (!reduced) yaw += 0.00035;
      const aspect = canvas.width / Math.max(1, canvas.height);
      const view = lookAt(yaw, pitch, zoom, aspect, time);
      gl.clearColor(parchment[0] ?? 1, parchment[1] ?? 1, parchment[2] ?? 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(viewLoc, false, view);

      if (edgeVerts.length && edgeBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(edgeVerts), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(colLoc);
        gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, 24, 12);
        gl.drawArrays(gl.LINES, 0, edgeVerts.length / 6);
      }
      if (nodeVerts.length && nodeBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nodeVerts), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(colLoc);
        gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, 24, 12);
        gl.drawArrays(gl.POINTS, 0, nodeVerts.length / 6);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('keydown', onKey);
      ro.disconnect();
      gl.deleteBuffer(nodeBuf);
      gl.deleteBuffer(edgeBuf);
      gl.deleteProgram(program);
    };
  }, [layout, reduced]);

  return (
    <div className="space-y-2">
      <p id={labelId} className="sr-only">
        {t('lineage.title')}
      </p>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-labelledby={labelId}
        className="h-80 w-full rounded-lg border-2 border-surface-border bg-surface"
      />
      {reduced ? <p className="text-sm text-ink-muted">{t('lineage.reducedMotion')}</p> : null}
    </div>
  );
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function lookAt(
  yaw: number,
  pitch: number,
  zoom: number,
  aspect: number,
  _time: number,
): Float32Array {
  const eyeX = zoom * Math.cos(pitch) * Math.sin(yaw);
  const eyeY = zoom * Math.sin(pitch);
  const eyeZ = zoom * Math.cos(pitch) * Math.cos(yaw);
  const view = lookAtMatrix([eyeX, eyeY, eyeZ], [0, 0, 0], [0, 1, 0]);
  const proj = perspective(Math.PI / 4, aspect, 0.1, 40);
  return multiply(proj, view);
}

function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

function lookAtMatrix(eye: number[], center: number[], up: number[]): Float32Array {
  const zx = (eye[0] ?? 0) - (center[0] ?? 0);
  const zy = (eye[1] ?? 0) - (center[1] ?? 0);
  const zz = (eye[2] ?? 0) - (center[2] ?? 0);
  const zl = 1 / Math.hypot(zx, zy, zz);
  const z0 = zx * zl;
  const z1 = zy * zl;
  const z2 = zz * zl;
  const xx = (up[1] ?? 0) * z2 - (up[2] ?? 0) * z1;
  const xy = (up[2] ?? 0) * z0 - (up[0] ?? 0) * z2;
  const xz = (up[0] ?? 0) * z1 - (up[1] ?? 0) * z0;
  const xl = 1 / Math.max(Math.hypot(xx, xy, xz), 1e-6);
  const x0 = xx * xl;
  const x1 = xy * xl;
  const x2 = xz * xl;
  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;
  const out = new Float32Array(16);
  out[0] = x0;
  out[1] = y0;
  out[2] = z0;
  out[4] = x1;
  out[5] = y1;
  out[6] = z1;
  out[8] = x2;
  out[9] = y2;
  out[10] = z2;
  out[12] = -(x0 * (eye[0] ?? 0) + x1 * (eye[1] ?? 0) + x2 * (eye[2] ?? 0));
  out[13] = -(y0 * (eye[0] ?? 0) + y1 * (eye[1] ?? 0) + y2 * (eye[2] ?? 0));
  out[14] = -(z0 * (eye[0] ?? 0) + z1 * (eye[1] ?? 0) + z2 * (eye[2] ?? 0));
  out[15] = 1;
  return out;
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      out[i * 4 + j] =
        (a[j] ?? 0) * (b[i * 4] ?? 0) +
        (a[4 + j] ?? 0) * (b[i * 4 + 1] ?? 0) +
        (a[8 + j] ?? 0) * (b[i * 4 + 2] ?? 0) +
        (a[12 + j] ?? 0) * (b[i * 4 + 3] ?? 0);
    }
  }
  return out;
}
