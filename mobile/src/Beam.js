import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { C } from './theme';

// psi(z,t) = sum c_n phi_n(z) e^{-i(n+1/2)t}; phi_n scaled so |phi_0|^2 = N(0,1), as in quant_beam/quantum.py.
// Coefficients drift to stand in for new ticks until the quantum feed is wired to the app.
const N = 16;
const Z = Array.from({ length: 97 }, (_, i) => -6 + i * 0.125);
function hermite(x) {
  const y = x / Math.SQRT2;
  const h = new Array(N);
  h[0] = Math.PI ** -0.25 * Math.exp((-y * y) / 2);
  h[1] = Math.SQRT2 * y * h[0];
  for (let n = 2; n < N; n++) h[n] = Math.sqrt(2 / n) * y * h[n - 1] - Math.sqrt((n - 1) / n) * h[n - 2];
  return h.map((v) => v * 2 ** -0.25);
}
const PHI = Z.map(hermite);
const BASE = [0.93, 0.1, 0.24, 0.06, 0.15, 0.03, 0.08, 0.02, 0.05, 0.01, 0.03, 0.01, 0.02, 0.005, 0.01, 0.003];

export default function Beam({ height = 200, seed = 0 }) {
  const [w, setW] = useState(0);
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((v) => v + 0.05), 50);
    return () => clearInterval(id);
  }, []);

  const paths = useMemo(() => {
    if (!w) return null;
    const c = BASE.map((b, n) => b * (1 + 0.25 * Math.sin(t * 0.13 * (n + 1) + seed * 1.7 + n)));
    const norm = Math.sqrt(c.reduce((s, v) => s + v * v, 0));
    const dens = PHI.map((ph) => {
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) {
        const a = (c[n] / norm) * ph[n], th = (n + 0.5) * t * 0.2;
        re += a * Math.cos(th);
        im -= a * Math.sin(th);
      }
      return re * re + im * im;
    });
    const normal = PHI.map((ph) => ph[0] * ph[0]);
    const max = Math.max(...dens, ...normal) * 1.08;
    const base = height - 4;
    const x = (i) => ((i / (Z.length - 1)) * w).toFixed(1);
    const y = (v) => (base - (v / max) * (height - 12)).toFixed(1);
    const line = (a) => a.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ');
    const beam = line(dens);
    return { beam, area: `${beam} L${w} ${base} L0 ${base} Z`, normal: line(normal), base };
  }, [w, t, height, seed]);

  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {paths && (
        <Svg width={w} height={height}>
          <Line x1="0" y1={paths.base} x2={w} y2={paths.base} stroke={C.line} />
          <Path d={paths.area} fill="rgba(157,139,255,0.22)" />
          <Path d={paths.beam} stroke={C.accent} strokeWidth={2.5} fill="none" />
          <Path d={paths.normal} stroke={C.normal} strokeWidth={1.5} strokeDasharray="5 4" fill="none" />
        </Svg>
      )}
    </View>
  );
}

export function Sparkline({ values, height = 120 }) {
  const [w, setW] = useState(0);
  const d = useMemo(() => {
    if (!w || !values || values.length < 2) return null;
    const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
    return values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)} ${(height - 6 - ((v - lo) / span) * (height - 12)).toFixed(1)}`).join(' ');
  }, [w, values, height]);
  const up = values && values.length > 1 && values[values.length - 1] >= values[0];
  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {d && <Svg width={w} height={height}><Path d={d} stroke={up ? C.green : C.red} strokeWidth={2} fill="none" /></Svg>}
    </View>
  );
}
