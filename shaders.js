// shaders.js — vanilla WebGL shader engine for the vCard PWA.
// One <canvas>, one active program at a time; programs are cached per shader key.
// Exposes: window.ShaderEngine, window.SHADER_DEFS

(function () {
  'use strict';

  // ── Shared GLSL prelude: uniforms + noise + interaction helpers ──
  var PRELUDE = [
    'precision highp float;',
    'varying vec2 v_uv;',
    'uniform vec2  u_res;',
    'uniform float u_time;',
    'uniform vec2  u_ptr;',
    'uniform float u_down;',
    'uniform vec2  u_tilt;',
    'uniform float u_speed;',
    'uniform float u_intensity;',
    'uniform float u_grain;',
    'uniform float u_glow;',
    'uniform vec3  u_colA;',
    'uniform vec3  u_colB;',
    'uniform vec3  u_colC;',
    'uniform vec3  u_colD;',
    '#define MAXR 8',
    'uniform vec2  u_rpos[MAXR];',
    'uniform float u_rage[MAXR];',
    'uniform sampler2D u_logo;',
    'uniform float u_hasLogo;',
    '',
    'float hash21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  float a = hash21(i), b = hash21(i+vec2(1.0,0.0)), c = hash21(i+vec2(0.0,1.0)), d = hash21(i+vec2(1.0,1.0));',
    '  vec2 u = f*f*(3.0-2.0*f);',
    '  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);',
    '}',
    'float fbm(vec2 p){',
    '  float s = 0.0, a = 0.5;',
    '  mat2 m = mat2(1.6,1.2,-1.2,1.6);',
    '  for(int i=0;i<5;i++){ s += a*vnoise(p); p = m*p; a *= 0.5; }',
    '  return s;',
    '}',
    'float aspect(){ return u_res.x/max(u_res.y,1.0); }',
    '',
    'vec2 ptrWarp(vec2 uv){',
    '  vec2 d = uv - u_ptr;',
    '  d.x *= aspect();',
    '  float r = length(d);',
    '  float amp = u_down * u_intensity * 0.11;',
    '  return normalize(d + 1e-5) * (-amp) * exp(-r*4.0);',
    '}',
    '',
    'vec3 ripples(vec2 uv){',
    '  vec3 acc = vec3(0.0);',
    '  for(int i=0;i<MAXR;i++){',
    '    float age = u_rage[i];',
    '    if(age >= 0.0){',
    '      vec2 d = uv - u_rpos[i];',
    '      d.x *= aspect();',
    '      float r = length(d);',
    '      float radius = age * 0.9;',
    '      float ring = exp(-pow((r - radius)/0.055, 2.0));',
    '      float decay = exp(-age*1.7);',
    '      acc.xy += normalize(d + 1e-5) * ring * decay;',
    '      acc.z  += ring * decay;',
    '    }',
    '  }',
    '  return acc * u_intensity;',
    '}',
    '',
  ].join('\n');

  var SHADER_DEFS = {
    grid: {
      label: 'Synthwave Grid',
      extra: '',
      body: [
        'vec2 uv = v_uv;',
        'float t = u_time*u_speed;',
        'uv += ptrWarp(uv);',
        'vec3 rp = ripples(uv);',
        'uv += rp.xy*0.03;',
        'float horizon = 0.46 + u_tilt.y*0.04;',
        'vec3 col;',
        'if(uv.y < horizon){',
        '  float persp = horizon - uv.y;',
        '  float z = 0.15/(persp+0.02);',
        '  float gx = (uv.x-0.5 - u_tilt.x*0.10)*z*3.0;',
        '  float gy = z*1.2 - t*1.2;',
        '  float lx = abs(fract(gx)-0.5);',
        '  float ly = abs(fract(gy)-0.5);',
        '  float gw = 0.045 + persp*0.16;',
        '  float line = smoothstep(gw,0.0,lx) + smoothstep(gw*0.8,0.0,ly);',
        '  line = clamp(line,0.0,1.0) * smoothstep(0.0,0.16,persp);',
        '  vec3 ground = mix(u_colB*0.22, u_colA, line);',
        '  ground += u_colC * smoothstep(0.13,0.0,persp)*0.8;',
        '  col = ground;',
        '} else {',
        '  float sy = (uv.y-horizon)/(1.0-horizon);',
        '  col = mix(u_colC*0.55, u_colB*0.32, sy);',
        '  vec2 sunp = vec2(0.5 + u_tilt.x*0.08, horizon+0.17);',
        '  vec3 suncol = mix(u_colD, u_colA, sy);',
        '  float sd = length((uv-sunp)*vec2(aspect(),1.0));',
        '  col += suncol * smoothstep(0.30, 0.0, sd) * 0.22 * u_glow;',
        '  float sun;',
        '  if(u_hasLogo > 0.5){',
        '    float hsz = 0.185;',
        '    vec2 luv = (uv - sunp) * vec2(aspect(), 1.0) / (hsz*2.0) + 0.5;',
        '    luv.y = 1.0 - luv.y;',
        '    float a = 0.0;',
        '    if(luv.x>0.0 && luv.x<1.0 && luv.y>0.0 && luv.y<1.0)',
        '      a = texture2D(u_logo, luv).a;',
        '    sun = a;',
        '  } else {',
        '    sun = smoothstep(0.155,0.14,sd);',
        '  }',
        '  float bands = smoothstep(0.0,0.5, fract((sunp.y-uv.y)*22.0)-0.12);',
        '  float cut = smoothstep(horizon+0.17, horizon, uv.y);',
        '  sun *= mix(1.0, bands, cut);',
        '  col = mix(col, suncol, sun);',
        '  float st = step(0.992, hash21(floor(uv*vec2(110.0,190.0))));',
        '  col += st*(0.4+0.4*sin(t*3.0+uv.x*40.0)) * smoothstep(horizon,1.0,uv.y);',
        '}',
        'col += u_colD * rp.z * 1.3 * u_glow;',
        'col += (hash21(uv*u_res + t) - 0.5) * u_grain;',
        'gl_FragColor = vec4(col, 1.0);',
      ].join('\n'),
    },

    aurora: {
      label: 'Aurora Nebula',
      extra: '',
      body: [
        'vec2 uv = v_uv;',
        'float t = u_time*u_speed*0.25;',
        'uv += ptrWarp(uv)*0.6;',
        'vec3 rp = ripples(uv);',
        'vec2 par = u_tilt*0.05 + (u_ptr-0.5)*0.02;',
        'vec2 np = uv*2.0 + par*2.2;',
        'float neb  = fbm(np + vec2(0.0,t));',
        'float neb2 = fbm(np*2.0 - vec2(t*0.5,0.0));',
        'vec3 col = mix(u_colA*0.5, u_colB, neb);',
        'col = mix(col, u_colC, neb2*0.55);',
        'float a = 0.0;',
        'for(int i=0;i<3;i++){',
        '  float fi = float(i);',
        '  float x = uv.x*2.0 + par.x*3.0;',
        '  float wave = 0.62 - fi*0.08 + 0.18*sin(x*3.0 + t*2.2 + fi*1.7) + 0.12*fbm(vec2(x*1.5, t+fi));',
        '  float band = exp(-pow((uv.y - wave)/0.11, 2.0));',
        '  a += band*(0.7 - fi*0.16);',
        '}',
        'col += u_colD * a * (0.9 + 0.6*u_glow);',
        'vec2 sp = uv + par*0.6;',
        'float st = step(0.994, hash21(floor(sp*vec2(120.0,260.0))));',
        'col += st*(0.6+0.4*sin(t*4.0 + sp.x*30.0));',
        'col += u_colD * rp.z * 1.1 * u_glow;',
        'col += (hash21(uv*u_res + t) - 0.5) * u_grain;',
        'gl_FragColor = vec4(col, 1.0);',
      ].join('\n'),
    },

    prism: {
      label: 'Prism Spectrum',
      extra: [
        'float ifield(vec2 q){',
        '  q.x += 0.42*sin(q.y*1.7 + 0.5 + u_time*0.12) + 0.14*sin(q.y*3.3 - u_time*0.18);',
        '  q.y += 0.10*cos(q.x*1.5 + u_time*0.1);',
        '  float f = fbm(q*6.57 + vec2(u_time*0.3, -u_time*0.2));',
        '  f += 0.4*sin((q.x*2.0 + q.y*3.0)*10.7 + u_time);',
        '  return f;',
        '}',
      ].join('\n'),
      body: [
        'vec2 uv = v_uv;',
        'uv += ptrWarp(uv);',
        'vec3 rp = ripples(uv);',
        'vec2 p = uv + rp.xy*0.05;',
        '',
        'vec2 entry = vec2(0.13, 0.87) + u_tilt*vec2(0.06, 0.05);',
        'vec2 rel = uv - entry; rel.x *= aspect();',
        'float distE = length(rel);',
        '',
        'vec2 disp = normalize(rel + 1e-4);',
        'float d = 0.05*u_intensity + 0.02;',
        'float r = ifield(p + disp*d);',
        'float g = ifield(p);',
        'float b = ifield(p - disp*d);',
        '',
        'float fan = exp(-distE*1.25);',
        'float fld = smoothstep(0.2, 1.05, g) * mix(0.30, 1.0, fan);',
        '',
        'vec3 hue = 0.5 + 0.5*cos(6.28318*((r+g+b)*0.5 + vec3(0.0,0.33,0.67)));',
        'hue = mix(vec3(1.0), hue, 0.42);',
        'vec3 base = vec3(0.34, 0.36, 0.44);',
        'vec3 col = mix(base, hue, fld);',
        'col = mix(col, col*u_colA, 0.20);',
        '',
        'vec2 inDir = normalize(vec2(0.85, -0.75) + u_tilt);',
        'float along = dot(rel, inDir);',
        'float perp  = length(rel - along*inDir);',
        'float shaft = exp(-pow(perp/0.028, 2.0)) * smoothstep(-0.05, 0.12, along) * exp(-along*1.35);',
        'float bloom = exp(-distE*distE*12.0);',
        'col += (shaft*0.55 + bloom*0.95) * u_colD * 0.5 * u_glow;',
        '',
        'col += rp.z*u_colD*1.0*u_glow;',
        'col += (hash21(uv*u_res + u_time) - 0.5) * u_grain;',
        'gl_FragColor = vec4(col, 1.0);',
      ].join('\n'),
    },
  };

  var VERT = [
    'attribute vec2 a_pos;',
    'varying vec2 v_uv;',
    'void main(){',
    '  v_uv = a_pos*0.5 + 0.5;',
    '  gl_Position = vec4(a_pos, 0.0, 1.0);',
    '}',
  ].join('\n');

  var MAXR = 8;

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    var n = parseInt(h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function compileShader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:\n' + gl.getShaderInfoLog(s));
    }
    return s;
  }

  function ShaderEngine(canvas) {
    var self = this;
    this.canvas = canvas;
    this.params = {
      palette: { a: '#ffffff', b: '#ffffff', c: '#ffffff', d: '#ffffff' },
      speed: 0.5, intensity: 1.0, grain: 0.05, glow: 1.0,
    };
    this.tilt = { x: 0, y: 0 };
    this.S = {
      ptr: { x: 0.5, y: 0.5 }, ptrTarget: { x: 0.5, y: 0.5 },
      down: 0, downTarget: 0, active: false,
      ripples: new Array(MAXR).fill(null),
    };
    this.t = 0;
    this.lastTs = 0;
    this.running = false;
    this.rafId = 0;
    this.currentKey = null;
    this.currentTexture = null;
    this.cur = null;
    this.W = 1; this.H = 1;
    this.rposArr = new Float32Array(MAXR * 2);
    this.rageArr = new Float32Array(MAXR);
    this._frame = this._frame.bind(this);

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      cancelAnimationFrame(self.rafId);
    });
    canvas.addEventListener('webglcontextrestored', function () {
      self._initGL();
      if (self.currentKey) self.use(self.currentKey, self.currentTexture, true);
      if (self.running) self.rafId = requestAnimationFrame(self._frame);
    });

    this._initGL();
    this._ro = new ResizeObserver(function () { self._resize(); });
    this._ro.observe(canvas);
    this._bindPointer();
  }

  ShaderEngine.prototype._initGL = function () {
    var gl = this.canvas.getContext('webgl', { antialias: true, premultipliedAlpha: false, alpha: false });
    this.gl = gl;
    this.programs = {};
    this.cur = null;
    if (!gl) { console.error('WebGL unavailable'); return; }
    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this._resize();
  };

  ShaderEngine.prototype._resize = function () {
    var r = this.canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, r.width * dpr);
    var h = Math.max(1, r.height * dpr);
    var maxSide = 900;
    var m = Math.max(w, h);
    if (m > maxSide) { var k = maxSide / m; w *= k; h *= k; }
    this.W = Math.round(w); this.H = Math.round(h);
    this.canvas.width = this.W; this.canvas.height = this.H;
    if (!this.running) this._tick(performance.now(), true);
  };

  ShaderEngine.prototype._build = function (key) {
    var gl = this.gl;
    var def = SHADER_DEFS[key];
    var frag = PRELUDE + (def.extra || '') + '\nvoid main(){\n' + def.body + '\n}\n';
    var prog = gl.createProgram();
    gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:\n' + gl.getProgramInfoLog(prog));
    }
    var U = function (n) { return gl.getUniformLocation(prog, n); };
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return {
      prog: prog,
      aPos: gl.getAttribLocation(prog, 'a_pos'),
      tex: tex, texReady: false, texLoading: false,
      uni: {
        res: U('u_res'), time: U('u_time'), ptr: U('u_ptr'), down: U('u_down'), tilt: U('u_tilt'),
        speed: U('u_speed'), intensity: U('u_intensity'), grain: U('u_grain'), glow: U('u_glow'),
        colA: U('u_colA'), colB: U('u_colB'), colC: U('u_colC'), colD: U('u_colD'),
        rpos: U('u_rpos'), rage: U('u_rage'),
        logo: U('u_logo'), hasLogo: U('u_hasLogo'),
      },
    };
  };

  // Switch the active shader. `texture` is an optional image URL/data-URI whose
  // alpha channel the shader can sample (grid uses it as the "sun" silhouette).
  ShaderEngine.prototype.use = function (key, texture, force) {
    var gl = this.gl; if (!gl) return;
    this.currentKey = key;
    this.currentTexture = texture || null;
    if (!this.programs[key] || force) this.programs[key] = this._build(key);
    var P = this.programs[key];
    gl.useProgram(P.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(P.aPos);
    gl.vertexAttribPointer(P.aPos, 2, gl.FLOAT, false, 0, 0);
    if (texture && !P.texReady && !P.texLoading) {
      P.texLoading = true;
      var im = new Image();
      var self = this;
      im.onload = function () {
        var g = self.gl;
        if (!g || g.isContextLost()) return;
        g.bindTexture(g.TEXTURE_2D, P.tex);
        g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, im);
        P.texReady = true;
        if (!self.running) self._tick(performance.now(), true);
      };
      im.onerror = function () { console.warn('logo texture failed to load'); };
      im.src = texture;
    }
    this.cur = P;
    if (!this.running) this._tick(performance.now(), true);
  };

  ShaderEngine.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.lastTs = 0;
    this.rafId = requestAnimationFrame(this._frame);
  };

  ShaderEngine.prototype.stop = function () {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  };

  ShaderEngine.prototype._frame = function (ts) {
    this.rafId = requestAnimationFrame(this._frame);
    this._tick(ts, false);
  };

  ShaderEngine.prototype._tick = function (ts, single) {
    var gl = this.gl;
    if (!gl || gl.isContextLost() || !this.cur) return;
    var dt = this.lastTs ? Math.min((ts - this.lastTs) / 1000, 0.05) : 0;
    this.lastTs = ts;
    if (!single) this.t += dt;
    var now = this.t;
    var S = this.S, p = this.params, P = this.cur;

    S.ptr.x += (S.ptrTarget.x - S.ptr.x) * 0.16;
    S.ptr.y += (S.ptrTarget.y - S.ptr.y) * 0.16;
    S.down += (S.downTarget - S.down) * 0.12;

    var idle = S.active ? 0 : 1;
    var tx = this.tilt.x + (S.ptr.x - 0.5) * 1.4 + Math.sin(now * 0.25) * 0.13 * idle;
    var ty = this.tilt.y + (S.ptr.y - 0.5) * 1.4 + Math.sin(now * 0.20 + 1.0) * 0.13 * idle;

    for (var i = 0; i < MAXR; i++) {
      var rp = S.ripples[i];
      if (rp && now - rp.t0 > 2.6) S.ripples[i] = null;
    }
    for (i = 0; i < MAXR; i++) {
      rp = S.ripples[i];
      if (rp) { this.rposArr[i * 2] = rp.x; this.rposArr[i * 2 + 1] = rp.y; this.rageArr[i] = now - rp.t0; }
      else { this.rposArr[i * 2] = 0; this.rposArr[i * 2 + 1] = 0; this.rageArr[i] = -1; }
    }

    var A = hexToRgb(p.palette.a), B = hexToRgb(p.palette.b), C = hexToRgb(p.palette.c), D = hexToRgb(p.palette.d);
    var u = P.uni;

    gl.viewport(0, 0, this.W, this.H);
    gl.uniform2f(u.res, this.W, this.H);
    gl.uniform1f(u.time, now);
    gl.uniform2f(u.ptr, S.ptr.x, S.ptr.y);
    gl.uniform1f(u.down, S.down);
    gl.uniform2f(u.tilt, tx, ty);
    gl.uniform1f(u.speed, p.speed);
    gl.uniform1f(u.intensity, p.intensity);
    gl.uniform1f(u.grain, p.grain);
    gl.uniform1f(u.glow, p.glow);
    gl.uniform3f(u.colA, A[0], A[1], A[2]);
    gl.uniform3f(u.colB, B[0], B[1], B[2]);
    gl.uniform3f(u.colC, C[0], C[1], C[2]);
    gl.uniform3f(u.colD, D[0], D[1], D[2]);
    gl.uniform2fv(u.rpos, this.rposArr);
    gl.uniform1fv(u.rage, this.rageArr);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, P.tex);
    gl.uniform1i(u.logo, 0);
    gl.uniform1f(u.hasLogo, P.texReady ? 1.0 : 0.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  // ── pointer interaction (drag warp + tap ripples) ──
  ShaderEngine.prototype._toUv = function (e) {
    var r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
  };

  ShaderEngine.prototype.addRipple = function (uv) {
    var S = this.S;
    var idx = -1;
    for (var i = 0; i < MAXR; i++) { if (!S.ripples[i]) { idx = i; break; } }
    if (idx === -1) idx = 0;
    S.ripples[idx] = { x: uv.x, y: uv.y, t0: this.t };
  };

  // Called by the app when a horizontal swipe takes over the gesture.
  ShaderEngine.prototype.cancelPress = function () {
    this.S.active = false;
    this.S.downTarget = 0;
  };

  ShaderEngine.prototype._bindPointer = function () {
    var self = this, canvas = this.canvas;
    canvas.addEventListener('pointerdown', function (e) {
      var S = self.S, uv = self._toUv(e);
      S.active = true; S.downTarget = 1;
      S.ptrTarget = uv;
      self.addRipple(uv);
      if (canvas.setPointerCapture && e.pointerId != null) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      }
    });
    canvas.addEventListener('pointermove', function (e) {
      var S = self.S;
      S.ptrTarget = self._toUv(e);
      if (S.active) e.preventDefault();
    }, { passive: false });
    window.addEventListener('pointerup', function () {
      self.S.active = false; self.S.downTarget = 0;
    });
    canvas.addEventListener('pointerleave', function () {
      if (!self.S.active) self.S.downTarget = 0;
    });
  };

  window.ShaderEngine = ShaderEngine;
  window.SHADER_DEFS = SHADER_DEFS;
})();
