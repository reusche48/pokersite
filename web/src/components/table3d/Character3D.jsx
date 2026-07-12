import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

// Personaje 3D de PRIMITIVAS (sin modelos de artista todavía): cabeza, cuerpo,
// dos brazos y un sombrero. Se anima por código según el "estado" que le llega
// desde las jugadas de la mesa. Es la prueba de concepto (Fase 1): feo pero
// suficiente para medir rendimiento y validar el cableado evento → animación.
//
// Estados: idle · think · bet · call · fold · allin · win · lose · sitout

const lerp = (a, b, t) => a + (b - a) * t;

// Poses objetivo por estado (posición/rotación de las partes). El personaje
// interpola suavemente hacia la pose de su estado en cada frame.
const POSES = {
  idle:   { lean: 0.0,   arms: 0.0,  y: 0,     headTilt: 0.0 },
  think:  { lean: 0.5,   arms: 0.2,  y: 0,     headTilt: 0.35 },
  call:   { lean: 0.25,  arms: 0.9,  y: 0,     headTilt: 0.0 },
  bet:    { lean: 0.35,  arms: 1.6,  y: 0,     headTilt: 0.0 },
  allin:  { lean: 0.7,   arms: 2.2,  y: 0.1,   headTilt: 0.0 },
  fold:   { lean: -0.5,  arms: -0.5, y: 0,     headTilt: -0.25 },
  win:    { lean: -0.25, arms: 2.0,  y: 0.6,   headTilt: 0.0 },
  lose:   { lean: 0.7,   arms: -0.6, y: -0.25, headTilt: 0.6 },
  sitout: { lean: 0.4,   arms: -0.4, y: -0.1,  headTilt: 0.5 },
};

export function Character3D({ state = 'idle', color = '#3b82f6', skin = '#e0ac69', seatLabel }) {
  const group = useRef();
  const armL = useRef();
  const armR = useRef();
  const head = useRef();
  const cur = useRef({ lean: 0, arms: 0, y: 0, headTilt: 0 });
  const t0 = useRef(0);

  useFrame((frameState, delta) => {
    const target = POSES[state] || POSES.idle;
    const c = cur.current;
    const k = Math.min(1, delta * 8); // suavizado del interpolado
    c.lean = lerp(c.lean, target.lean, k);
    c.arms = lerp(c.arms, target.arms, k);
    c.y = lerp(c.y, target.y, k);
    c.headTilt = lerp(c.headTilt, target.headTilt, k);

    t0.current += delta;
    const t = t0.current;

    if (group.current) {
      // respiración (idle) + rebote en victoria
      const breathe = Math.sin(t * 2) * 0.015;
      const winBounce = state === 'win' ? Math.abs(Math.sin(t * 8)) * 0.15 : 0;
      group.current.rotation.x = c.lean;
      group.current.position.y = c.y + breathe + winBounce;
    }
    if (armL.current && armR.current) {
      // los brazos se levantan/empujan según "arms"
      armL.current.rotation.x = -c.arms * 1.4;
      armR.current.rotation.x = -c.arms * 1.4;
      // en victoria, brazos arriba
      if (state === 'win') { armL.current.rotation.x = -2.2; armR.current.rotation.x = -2.2; }
    }
    if (head.current) {
      head.current.rotation.z = c.headTilt;
      // en "think", la cabeza mira ligeramente a las cartas
      head.current.rotation.x = state === 'think' ? 0.2 : 0;
    }
  });

  const dim = state === 'fold' || state === 'sitout';

  return (
    <group ref={group}>
      {/* Cuerpo */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.32, 0.5, 4, 12]} />
        <meshStandardMaterial color={color} opacity={dim ? 0.5 : 1} transparent={dim} roughness={0.7} />
      </mesh>

      {/* Cabeza + sombrero */}
      <group ref={head} position={[0, 1.15, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.26, 16, 16]} />
          <meshStandardMaterial color={skin} opacity={dim ? 0.5 : 1} transparent={dim} roughness={0.6} />
        </mesh>
        {/* Ojos */}
        <mesh position={[-0.09, 0.03, 0.23]}><sphereGeometry args={[0.035, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
        <mesh position={[0.09, 0.03, 0.23]}><sphereGeometry args={[0.035, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
        {/* Sombrero (ala + copa) */}
        <mesh position={[0, 0.24, 0]} castShadow>
          <cylinderGeometry args={[0.34, 0.34, 0.03, 16]} />
          <meshStandardMaterial color="#222" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.32, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.16, 16]} />
          <meshStandardMaterial color="#222" roughness={0.9} />
        </mesh>
      </group>

      {/* Brazos (pivotan desde el hombro) */}
      <group ref={armL} position={[-0.34, 0.85, 0]}>
        <mesh position={[0, -0.22, 0.05]} rotation={[0.3, 0, 0]} castShadow>
          <capsuleGeometry args={[0.1, 0.4, 4, 8]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      </group>
      <group ref={armR} position={[0.34, 0.85, 0]}>
        <mesh position={[0, -0.22, 0.05]} rotation={[0.3, 0, 0]} castShadow>
          <capsuleGeometry args={[0.1, 0.4, 4, 8]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      </group>

      {/* Cartas y fichas frente al jugador (referencia de mesa) */}
      <group position={[0, 0.05, 0.55]}>
        <mesh position={[-0.12, 0, 0]} rotation={[-1.3, 0, 0.1]}>
          <planeGeometry args={[0.16, 0.22]} />
          <meshStandardMaterial color="#f8f8f8" side={2} />
        </mesh>
        <mesh position={[0.12, 0, 0]} rotation={[-1.3, 0, -0.1]}>
          <planeGeometry args={[0.16, 0.22]} />
          <meshStandardMaterial color="#f8f8f8" side={2} />
        </mesh>
        {[0, 0.04, 0.08].map((y, i) => (
          <mesh key={i} position={[0.35, y + 0.02, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.03, 16]} />
            <meshStandardMaterial color={['#c0392b', '#2980b9', '#27ae60'][i]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
